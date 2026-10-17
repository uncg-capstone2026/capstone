import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { comboKey } from '../gemini/outfit-planning/candidates';
import { StyleMemoryService, type MemorySession } from '../gemini/style-memory/service';
import { PrismaService } from '../prisma/prisma.service';
import { StyleNotesService } from '../style-notes/style-notes.service';

// A Stylist session with no activity for this long is marked abandoned.
const ABANDON_AFTER_HOURS = 24;

// Sessions looked at per batch, and the most batches per run, so one run
// can't go on forever. Anything left over is picked up next hour.
const BATCH_SIZE = 20;
const MAX_BATCHES = 10;

// Notes without an embedding (older ones, or failed) embedded per run.
const NOTES_EMBEDDED_PER_RUN = 50;

// Learns the user's style from their finished Stylist sessions
// (ai/repromptimplementation.md, "Memory job"), saving what it finds as
// Learned style notes. Each run:
// 1. marks sessions with no activity for 24 hours as abandoned
// 2. for each completed or abandoned session not yet processed, asks Gemini
//    for lasting style facts and saves them (StyleNotesService.createLearned)
// 3. embeds notes that don't have an embedding yet
//
// Runs at the start of every hour, and once when the server starts. Safe to
// run on several server instances at once: each session is claimed (its
// memoryProcessed flag set) before it's processed, so it's never done twice.
@Injectable()
export class MemoryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MemoryService.name);
  private running = false; // stops this instance overlapping with itself

  constructor(
    private readonly prisma: PrismaService,
    private readonly styleMemory: StyleMemoryService,
    private readonly notes: StyleNotesService,
  ) {}

  // In the background, so it doesn't slow down server startup.
  onApplicationBootstrap() {
    void this.run('startup');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    await this.run('hourly');
  }

  async run(trigger: 'startup' | 'hourly'): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const abandoned = await this.abandonIdleSessions();
      const { processed, learned } = await this.processFinishedSessions();
      const embedded = await this.notes.embedMissing(NOTES_EMBEDDED_PER_RUN);
      if (abandoned > 0 || processed > 0 || embedded > 0) {
        this.logger.log(
          `Memory (${trigger}): abandoned ${abandoned} session(s), processed ${processed} session(s), `
          + `learned ${learned} note(s), embedded ${embedded} older note(s)`,
        );
      }
    } catch (err) {
      this.logger.error(`Memory (${trigger}) failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // ---- Step 1: abandon idle sessions ----

  // Active sessions untouched for ABANDON_AFTER_HOURS. Reprompting or
  // accepting one afterwards is a 409, like any finished session.
  private async abandonIdleSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);
    const { count } = await this.prisma.outfitSession.updateMany({
      where: { status: 'active', updatedAt: { lt: cutoff } },
      data: { status: 'abandoned' },
    });
    return count;
  }

  // ---- Step 2: learn from finished sessions ----

  private async processFinishedSessions(): Promise<{ processed: number; learned: number }> {
    let processed = 0;
    let learned = 0;
    const failed: string[] = []; // retried next run, not again in this one
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const sessions = await this.prisma.outfitSession.findMany({
        where: { status: { in: ['completed', 'abandoned'] }, memoryProcessed: false, id: { notIn: failed } },
        orderBy: { updatedAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (sessions.length === 0) break;

      for (const { id } of sessions) {
        // Claim it. 0 rows updated means another run already did.
        const claimed = await this.prisma.outfitSession.updateMany({
          where: { id, memoryProcessed: false },
          data: { memoryProcessed: true },
        });
        if (claimed.count === 0) continue;
        try {
          learned += await this.learnFrom(id);
          processed++;
        } catch (err) {
          this.logger.warn(`Memory failed for session ${id}, will retry: ${(err as Error).message}`);
          failed.push(id);
          await this.prisma.outfitSession.update({ where: { id }, data: { memoryProcessed: false } });
        }
      }
      if (sessions.length < BATCH_SIZE) break;
    }
    return { processed, learned };
  }

  // Asks Gemini what the session shows about the user's style and saves it.
  // A session with one outfit and no feedback is skipped without an AI call:
  // there's nothing to learn from it. Returns how many notes were saved.
  private async learnFrom(sessionId: string): Promise<number> {
    const session = await this.prisma.outfitSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        turns: { where: { status: { not: 'failed' } }, orderBy: { turnNumber: 'asc' } },
        acceptedTurn: { select: { turnNumber: true } },
      },
    });

    // "Not for me" answers on this session's outfits.
    const suggestionIds = session.turns.map((turn) => comboKey(turn.chosenItemIds));
    const feedback = (await this.prisma.styleFeedback.findMany({
      where: {
        userId: session.userId,
        kind: 'Rejected',
        suggestionId: { in: suggestionIds },
        createdAt: { gte: session.createdAt },
        feedback: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { feedback: true },
    })).flatMap((row) => (row.feedback ? [row.feedback] : []));

    if (session.turns.length <= 1 && feedback.length === 0) return 0;

    const itemIds = [...new Set(session.turns.flatMap((turn) => turn.chosenItemIds))];
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, userId: session.userId },
      select: { id: true, name: true, type: true },
    });
    const describe = new Map(items.map((item) => [item.id, item.type ? `${item.name} (${item.type})` : item.name]));

    const input: MemorySession = {
      request: session.originalPrompt,
      turns: session.turns.map((turn) => ({
        turnNumber: turn.turnNumber,
        userMessage: turn.userMessage,
        outfitName: turn.name,
        itemNames: turn.chosenItemIds.map((id) => describe.get(id)).filter((name) => name !== undefined),
      })),
      acceptedTurn: session.acceptedTurn?.turnNumber ?? null,
      feedback,
      existingNotes: (await this.notes.listForPrompt(session.userId)).map((note) => note.text),
    };

    // AI (Gemini, fast model): lasting style facts this session shows, if any.
    const facts = await this.styleMemory.extractFacts(input);
    return facts.length > 0 ? this.notes.createLearned(session.userId, facts) : 0;
  }
}

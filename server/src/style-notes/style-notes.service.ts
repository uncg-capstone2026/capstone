import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NoteSource, StyleNote as StyleNoteRow } from '@prisma/client';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../gemini/constants';
import { GeminiHelpers } from '../gemini/helpers';
import { PrismaService } from '../prisma/prisma.service';

// One note, as the app shows it. Matches StyleNote in client/src/services/style-notes.ts.
export type StyleNote = {
  id: string;
  text: string;
  source: 'user' | 'learned';
  createdAt: Date; // sent as an ISO timestamp
};

// A note as the prompts use it.
export type PromptNote = { text: string; source: StyleNote['source']; createdAt: Date };

export const MAX_NOTE_LENGTH = 200; // MAX_NOTE_LENGTH in the app
export const MAX_NOTES = 50;

// A learned note this close (cosine distance) to one the user already has is
// treated as a repeat and not saved.
const DUPLICATE_NOTE_DISTANCE = 0.15;

const SOURCE_TO_CLIENT: Record<NoteSource, StyleNote['source']> = { User: 'user', Learned: 'learned' };

@Injectable()
export class StyleNotesService {
  private readonly logger = new Logger(StyleNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiHelpers,
  ) {}

  // GET /api/style-notes: newest first.
  async list(userId: string): Promise<StyleNote[]> {
    const notes = await this.prisma.styleNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map(toClient);
  }

  // POST /api/style-notes { text } -> the new note. 400 if the text is empty or
  // over 200 characters. At 50 notes the oldest learned note is deleted to
  // make room; 400 only if all 50 are the user's own. The note is then
  // embedded; if that fails it's still saved, just without an embedding.
  async create(userId: string, rawText: string): Promise<StyleNote> {
    const text = normalize(rawText);
    if (!text) throw new BadRequestException('Write a note first');
    if (text.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(`Notes can be at most ${MAX_NOTE_LENGTH} characters`);
    }

    const note = await this.prisma.$transaction(async (tx) => {
      if (!(await makeRoom(tx, userId))) {
        throw new BadRequestException(`You can have up to ${MAX_NOTES} notes. Delete one to add another.`);
      }
      return tx.styleNote.create({ data: { userId, text, source: 'User' } });
    });
    await this.addEmbedding(note.id, text);
    return toClient(note);
  }

  // DELETE /api/style-notes/:id. 404 if it isn't the user's note.
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.styleNote.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Note not found');
  }

  // ---- For Javier's prompt builders ----
  // Import StyleNotesModule into the module that builds the prompt, then inject
  // StyleNotesService. (StyleNotesModule doesn't import GeminiModule, so this
  // can't create a circular import.)

  // All the user's notes, newest first, with where each came from and when.
  async listForPrompt(userId: string): Promise<PromptNote[]> {
    const notes = await this.prisma.styleNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_NOTES,
      select: { text: true, source: true, createdAt: true },
    });
    return notes.map((note) => ({ ...note, source: SOURCE_TO_CLIENT[note.source] }));
  }

  // The user's notes closest in meaning to an embedding (e.g. the request's,
  // from the same embedding model), closest first, with their cosine distance
  // (0 is identical). maxDistance leaves out anything further away. Notes
  // without an embedding are skipped.
  async findRelevant(
    userId: string,
    embedding: number[],
    { limit = 10, maxDistance }: { limit?: number; maxDistance?: number } = {},
  ): Promise<(PromptNote & { distance: number })[]> {
    const vector = `[${embedding.join(',')}]`;
    const within = maxDistance === undefined
      ? Prisma.empty
      : Prisma.sql`AND (embedding <=> ${vector}::vector) <= ${maxDistance}`;
    const rows = await this.prisma.$queryRaw<{ text: string; source: NoteSource; createdAt: Date; distance: number }[]>`
      SELECT text, source, "createdAt", (embedding <=> ${vector}::vector)::float8 AS distance
      FROM "StyleNote"
      WHERE "userId" = ${userId} AND embedding IS NOT NULL ${within}
      ORDER BY distance
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ ...row, source: SOURCE_TO_CLIENT[row.source] }));
  }

  // ---- For the memory job ----

  // Saves facts learned from a Stylist session as Learned notes, embedded.
  // A fact that repeats a note the user already has is skipped. At 50 notes
  // the oldest learned notes are deleted to make room; user notes never are,
  // so once all 50 are the user's own, nothing more is saved. Returns how
  // many were saved. Throws if a fact can't be embedded (to try again later).
  async createLearned(userId: string, facts: string[]): Promise<number> {
    let saved = 0;
    for (const fact of facts) {
      const text = normalize(fact).slice(0, MAX_NOTE_LENGTH);
      if (!text) continue;

      const embedding = await this.embed(text);
      const repeats = await this.findRelevant(userId, embedding, { limit: 1, maxDistance: DUPLICATE_NOTE_DISTANCE });
      if (repeats.length > 0) continue;

      const note = await this.prisma.$transaction(async (tx) => {
        if (!(await makeRoom(tx, userId))) return null;
        return tx.styleNote.create({ data: { userId, text, source: 'Learned' } });
      });
      if (!note) break; // all 50 are the user's own
      await this.saveEmbedding(note.id, embedding);
      saved++;
    }
    return saved;
  }

  // Embeds up to limit notes that don't have an embedding yet (e.g. from
  // before embeddings, or whose embedding failed), oldest first. Returns how
  // many were tried.
  async embedMissing(limit: number): Promise<number> {
    const notes = await this.prisma.$queryRaw<{ id: string; text: string }[]>`
      SELECT id, text FROM "StyleNote" WHERE embedding IS NULL ORDER BY "createdAt" LIMIT ${limit}
    `;
    for (const note of notes) await this.addEmbedding(note.id, note.text);
    return notes.length;
  }

  // ---- Helpers ----

  // Embeds and saves the note's text. Failures are logged, never thrown.
  private async addEmbedding(noteId: string, text: string): Promise<void> {
    try {
      await this.saveEmbedding(noteId, await this.embed(text));
    } catch (err) {
      this.logger.warn(`Embedding failed for style note ${noteId}: ${(err as Error).message}`);
    }
  }

  // Embeds text with the same model and size as items and requests, so they
  // can be compared.
  private async embed(text: string): Promise<number[]> {
    const response = await this.gemini.ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${values?.length ?? 'none'}`);
    }
    return values;
  }

  // Prisma can't write the vector type, so it goes in as '[0.1,...]' text and
  // is cast in SQL.
  private async saveEmbedding(noteId: string, values: number[]): Promise<void> {
    const vector = `[${values.join(',')}]`;
    await this.prisma.$executeRaw`UPDATE "StyleNote" SET embedding = ${vector}::vector WHERE id = ${noteId}`;
  }
}

// Whether the user has room for one more note, after deleting their oldest
// learned notes if they're at MAX_NOTES. The user's own notes are never
// deleted, so this is false only when all of them are the user's.
async function makeRoom(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const over = (await tx.styleNote.count({ where: { userId } })) - MAX_NOTES + 1;
  if (over <= 0) return true;
  const oldest = await tx.styleNote.findMany({
    where: { userId, source: 'Learned' },
    orderBy: { createdAt: 'asc' },
    take: over,
    select: { id: true },
  });
  await tx.styleNote.deleteMany({ where: { id: { in: oldest.map((note) => note.id) } } });
  return oldest.length === over;
}

// Whitespace collapsed to single spaces, trimmed.
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function toClient(note: StyleNoteRow): StyleNote {
  return { id: note.id, text: note.text, source: SOURCE_TO_CLIENT[note.source], createdAt: note.createdAt };
}
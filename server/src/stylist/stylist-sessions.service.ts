import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type OutfitSession, type OutfitTurn, type OutfitTurnRoute } from '@prisma/client';
import type { CandidateLists } from '../gemini/outfit-planning/candidates';
import { PrismaService } from '../prisma/prisma.service';
import type { Weather } from '../weather/weather.service';

// The expansion's garment list; what each turn's search is based on.
export type Requirements = { items: { type: string; semantic_query: string }[] };

// An extra outfit from a selection, kept for the next reroll.
export type QueuedOutfit = { itemIds: string[]; name: string; reasons: string[] };

export type SessionWithTurns = OutfitSession & { turns: OutfitTurn[] };

// Everything stored about one shown outfit.
export type NewTurn = {
  turnNumber: number;
  userMessage: string;
  route: OutfitTurnRoute;
  requirements: Requirements;
  candidates: CandidateLists;
  sentItemIds: string[];
  chosenItemIds: string[];
  name: string;
  reasons: string[];
};

// Session fields a reprompt can change.
export type SessionUpdate = {
  queuedOutfits: QueuedOutfit[];
  bannedItemIds: string[];
  historySummary: string | null;
  summarizedThroughTurn: number;
};

const SESSION_NOT_FOUND = 'That outfit conversation was not found.';
const SESSION_CLOSED = 'This outfit conversation is finished. Start a new request.';
const TURN_CLASH = 'Another suggestion is already being made for this conversation.';
const NOT_LATEST = 'Only the latest suggestion can be accepted.';

// Reads and writes Stylist sessions and turns. No AI here.
@Injectable()
export class StylistSessionsService {
  private readonly logger = new Logger(StylistSessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Creates the session and its first turn together.
  async createSession(
    userId: string,
    data: { originalPrompt: string; date: string | null; weather: Weather | null; queuedOutfits: QueuedOutfit[]; turn: NewTurn },
  ): Promise<{ session: OutfitSession; turn: OutfitTurn }> {
    const session = await this.prisma.outfitSession.create({
      data: {
        userId,
        originalPrompt: data.originalPrompt,
        date: data.date,
        weather: data.weather ? (data.weather as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        queuedOutfits: json(data.queuedOutfits),
        bannedItemIds: [],
        turns: { create: turnData(data.turn) },
      },
      include: { turns: true },
    });
    return { session, turn: session.turns[0] };
  }

  // The user's session with every turn, oldest first. 404 if it isn't theirs,
  // 409 if it's already finished.
  async getActiveSession(userId: string, sessionId: string): Promise<SessionWithTurns> {
    const session = await this.prisma.outfitSession.findFirst({
      where: { id: sessionId, userId },
      include: { turns: { orderBy: { turnNumber: 'asc' } } },
    });
    if (!session) throw new NotFoundException(SESSION_NOT_FOUND);
    if (session.status !== 'active') throw new ConflictException(SESSION_CLOSED);
    return session;
  }

  // In one transaction: the previous turn becomes rejected, the new turn is
  // saved, and the session's queue, bans and summary are updated. Two
  // reprompts at once would both take the same turn number; the second gets 409.
  async recordTurn(sessionId: string, previousTurnId: string, turn: NewTurn, update: SessionUpdate): Promise<OutfitTurn> {
    try {
      const [, created] = await this.prisma.$transaction([
        this.prisma.outfitTurn.update({ where: { id: previousTurnId }, data: { status: 'rejected' } }),
        this.prisma.outfitTurn.create({ data: { ...turnData(turn), sessionId } }),
        this.prisma.outfitSession.update({
          where: { id: sessionId },
          data: {
            queuedOutfits: json(update.queuedOutfits),
            bannedItemIds: update.bannedItemIds,
            historySummary: update.historySummary,
            summarizedThroughTurn: update.summarizedThroughTurn,
          },
        }),
      ]);
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(TURN_CLASH);
      }
      throw err;
    }
  }

  // Saves a reprompt that didn't produce an outfit, so its message is kept
  // (for the memory job) but no route ever continues from it. Never throws.
  async recordFailedTurn(
    sessionId: string,
    turn: Pick<NewTurn, 'turnNumber' | 'userMessage' | 'route' | 'requirements' | 'candidates'>,
    error: string,
  ): Promise<void> {
    try {
      await this.prisma.outfitTurn.create({
        data: {
          sessionId,
          turnNumber: turn.turnNumber,
          userMessage: turn.userMessage,
          route: turn.route,
          requirements: json(turn.requirements),
          candidates: json(turn.candidates),
          sentItemIds: [],
          chosenItemIds: [],
          reasons: [],
          status: 'failed',
          error: error.slice(0, 1000),
        },
      });
    } catch (err) {
      this.logger.warn(`Could not save failed turn for session ${sessionId}: ${(err as Error).message}`);
    }
  }

  // For the accept route ("Looks right"): marks the turn accepted and the
  // session completed. Only the latest pending turn can be accepted. Pass the
  // accept route's transaction client as tx so this and the saved Outfit +
  // CalendarEntry succeed or fail together. Returns the outfit's items and name.
  async acceptTurn(
    userId: string,
    sessionId: string,
    turnId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ chosenItemIds: string[]; name: string | null }> {
    const session = await tx.outfitSession.findFirst({
      where: { id: sessionId, userId },
      include: { turns: { where: { status: 'pending' }, orderBy: { turnNumber: 'desc' }, take: 1 } },
    });
    if (!session) throw new NotFoundException(SESSION_NOT_FOUND);
    if (session.status !== 'active') throw new ConflictException(SESSION_CLOSED);
    const latest = session.turns[0];
    if (!latest || latest.id !== turnId) throw new ConflictException(NOT_LATEST);

    await tx.outfitTurn.update({ where: { id: turnId }, data: { status: 'accepted' } });
    await tx.outfitSession.update({
      where: { id: sessionId },
      data: { status: 'completed', acceptedTurnId: turnId, queuedOutfits: json([]) },
    });
    return { chosenItemIds: latest.chosenItemIds, name: latest.name };
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function turnData(turn: NewTurn) {
  return {
    turnNumber: turn.turnNumber,
    userMessage: turn.userMessage,
    route: turn.route,
    requirements: json(turn.requirements),
    candidates: json(turn.candidates),
    sentItemIds: turn.sentItemIds,
    chosenItemIds: turn.chosenItemIds,
    name: turn.name || null,
    reasons: turn.reasons,
  };
}

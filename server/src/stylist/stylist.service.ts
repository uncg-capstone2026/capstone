import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OutfitTurn } from '@prisma/client';
import { CANDIDATES_SENT_PER_TYPE, MAX_TURNS_PER_SESSION } from '../gemini/constants';
import { HistorySummaryService } from '../gemini/history-summary/service';
import { comboKey, pickToSend, type CandidateLists } from '../gemini/outfit-planning/candidates';
import { OutfitPlanningService, type OutfitCandidate, type SelectedOutfit } from '../gemini/outfit-planning/service';
import { QueryExpansionService } from '../gemini/query-expansion/service';
import type { RefineEdits, RouteDecision, SearchItem } from '../gemini/reprompt-router/sanitize';
import { RepromptRouterService } from '../gemini/reprompt-router/service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { WeatherService, type Weather } from '../weather/weather.service';
import { fromSuggestionId, toSuggestion, type OutfitSuggestion, type SuggestionPiece } from './outfit-suggestion';
import {
  StylistSessionsService,
  type QueuedOutfit,
  type Requirements,
  type SessionWithTurns,
} from './stylist-sessions.service';
import { formatHistory, historyWindow, replyTo } from './turn-history';

const NOT_ENOUGH_ITEMS = 'Not enough matching items in your closet to build an outfit';
const NO_NEW_OUTFITS = "That's every outfit StyleMe can find for this. Try describing the occasion differently.";
const AI_UNAVAILABLE = 'StyleMe could not put an outfit together right now. Please try again.';
const TOO_MANY_TURNS = "That's a lot of suggestions for one request. Start a new request to keep going.";

type Location = { lat: number; lon: number } | null;

// Shared state for one reprompt.
type RepromptContext = {
  userId: string;
  session: SessionWithTurns;
  turns: OutfitTurn[]; // usable turns (not failed), oldest first
  latest: OutfitTurn; // the outfit on screen
  current: SuggestionPiece[]; // its pieces that are still in the closet
  request: string; // the original request, with the date line
  weather: Weather | null; // stored on turn 1
  message: string; // the user's feedback; '' for "Try another"
  banned: Set<string>;
  shownOutfits: string[][]; // every outfit shown, as item ids
  shownItemIds: string[];
  history: string | null;
};

// What a route produces, saved as the new turn.
type RouteResult = {
  outfit: { items: SuggestionPiece[]; name: string; reasons: string[] };
  queue: QueuedOutfit[];
  requirements: Requirements;
  candidates: CandidateLists;
  sentItemIds: string[];
  banned: Set<string>;
};

type Selection = { outfits: SelectedOutfit[]; missing: string | null; sentIds: string[] };

// The Stylist tab: turns a request into an outfit from the user's closet, and
// reacts to feedback on it (ai/repromptimplementation.md). The AI steps are
// the services in gemini/; sessions and turns are saved by StylistSessionsService.
@Injectable()
export class StylistService {
  private readonly logger = new Logger(StylistService.name);

  constructor(
    private readonly queryExpansion: QueryExpansionService,
    private readonly outfitPlanning: OutfitPlanningService,
    private readonly router: RepromptRouterService,
    private readonly historySummary: HistorySummaryService,
    private readonly sessions: StylistSessionsService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly weather: WeatherService,
  ) {}

  // POST /outfit: expand the request, find matching closet items, have Gemini
  // pick up to 3 outfits, and start a session with the first one. The others
  // are queued for "Try another". 422 when there isn't a complete outfit.
  async startSession(
    userId: string,
    input: { occasion: string; date?: string; location: Location; excludeSuggestionIds: string[] },
  ): Promise<OutfitSuggestion> {
    return this.withAiErrors(async () => {
      const request = requestText(input.occasion, input.date);
      // Fetched first, so the expansion already picks clothes for the day.
      const weather = await this.dayWeather(input.location, input.date);

      // AI (Gemini query expansion + embedding): turns the request and the day's
      // weather into garment types with photo-like descriptions, embedded so the
      // closet can be searched by meaning.
      const expanded = await this.queryExpansion.expandAndEmbedQuery(request, weather);
      const lists = await this.outfitPlanning.findCandidates(userId, expanded.items);

      // The app's old "Try another": outfits already shown, sent back as
      // suggestionIds. Remove once the app uses the reprompt route.
      const shownOutfits = input.excludeSuggestionIds
        .map(fromSuggestionId)
        .filter((ids): ids is string[] => ids !== null);

      const selection = await this.select({ userId, request, weather, lists, shownOutfits });
      if (selection.outfits.length === 0) {
        throw new UnprocessableEntityException(
          selection.missing ?? (shownOutfits.length > 0 ? NO_NEW_OUTFITS : NOT_ENOUGH_ITEMS),
        );
      }

      const [first, ...rest] = selection.outfits;
      const { session, turn } = await this.sessions.createSession(userId, {
        originalPrompt: input.occasion,
        date: input.date ?? null,
        weather,
        queuedOutfits: rest.map(toQueued),
        turn: {
          turnNumber: 1,
          userMessage: input.occasion,
          route: 'initial',
          requirements: toRequirements(expanded.items),
          candidates: lists,
          sentItemIds: selection.sentIds,
          chosenItemIds: first.items.map((item) => item.id),
          name: first.name,
          reasons: first.reasons,
        },
      });
      return toSuggestion(this.s3, first, { sessionId: session.id, turnId: turn.id });
    });
  }

  // POST /outfit/reprompt: the user's reaction to the outfit on screen. An
  // empty message ("Try another") is a reroll; anything else goes through the
  // router, which picks reroll, swap, refine or restart.
  async reprompt(userId: string, sessionId: string, rawMessage: string): Promise<OutfitSuggestion> {
    return this.withAiErrors(async () => {
      const message = rawMessage.trim();
      const session = await this.sessions.getActiveSession(userId, sessionId);
      const turnNumber = Math.max(...session.turns.map((turn) => turn.turnNumber)) + 1;
      if (turnNumber > MAX_TURNS_PER_SESSION) throw new UnprocessableEntityException(TOO_MANY_TURNS);

      const turns = session.turns.filter((turn) => turn.status !== 'failed');
      const latest = turns[turns.length - 1];
      if (!latest) throw new UnprocessableEntityException(NOT_ENOUGH_ITEMS);

      // Names for the history, and the pieces of the outfit on screen.
      const window = historyWindow(turns, session.summarizedThroughTurn);
      const pieceIds = [...new Set([...window.recent, ...window.toSummarize].flatMap((turn) => turn.chosenItemIds))];
      const pieces = await this.loadPieces(userId, pieceIds);
      const byId = new Map(pieces.map((piece) => [piece.id, piece]));

      const ctx: RepromptContext = {
        userId,
        session,
        turns,
        latest,
        current: latest.chosenItemIds.map((id) => byId.get(id)).filter((piece) => piece !== undefined),
        request: requestText(session.originalPrompt, session.date ?? undefined),
        weather: session.weather as unknown as Weather | null,
        message,
        banned: new Set(session.bannedItemIds),
        shownOutfits: turns.map((turn) => turn.chosenItemIds),
        shownItemIds: [...new Set(turns.flatMap((turn) => turn.chosenItemIds))],
        history: null,
      };

      // AI (Gemini router + history summary, fast model): decides what the
      // feedback should change and, once turns fall out of the last 5,
      // compresses them. Run together since neither needs the other.
      const [decision, summary] = await Promise.all([
        this.decideRoute(ctx),
        this.updateSummary(session, turns, window, byId),
      ]);
      ctx.history = formatHistory({
        summary: summary.text,
        recent: window.recent,
        itemNames: new Map(pieces.map((piece) => [piece.id, piece.name])),
        message,
      });
      // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
      this.logger.log(`[DEBUG AI] reprompt session=${session.id} turn=${turnNumber} route=${JSON.stringify(decision)}`);
      // ==================== END TEST / DEBUG ====================

      try {
        const result = await this.runRoute(ctx, decision);
        const turn = await this.sessions.recordTurn(
          session.id,
          latest.id,
          {
            turnNumber,
            userMessage: message,
            route: decision.route,
            requirements: result.requirements,
            candidates: result.candidates,
            sentItemIds: result.sentItemIds,
            chosenItemIds: result.outfit.items.map((item) => item.id),
            name: result.outfit.name,
            reasons: result.outfit.reasons,
          },
          {
            queuedOutfits: result.queue,
            bannedItemIds: [...result.banned],
            historySummary: summary.text,
            summarizedThroughTurn: summary.through,
          },
        );
        return toSuggestion(this.s3, result.outfit, { sessionId: session.id, turnId: turn.id });
      } catch (err) {
        // Keep the message for later, but never continue from this turn.
        // A turn-number clash means another reprompt already took this number.
        if (!(err instanceof ConflictException)) {
          await this.sessions.recordFailedTurn(session.id, {
            turnNumber,
            userMessage: message,
            route: decision.route,
            requirements: latest.requirements as Requirements,
            candidates: latest.candidates as CandidateLists,
          }, (err as Error).message);
        }
        throw err;
      }
    });
  }

  // ---- Routes ----

  private runRoute(ctx: RepromptContext, decision: RouteDecision): Promise<RouteResult> {
    switch (decision.route) {
      case 'reroll': return this.reroll(ctx);
      case 'swap': return this.swap(ctx, decision.swapTypes);
      case 'refine': return this.refine(ctx, decision.edits);
      case 'restart': return this.restart(ctx);
    }
  }

  // Another option for the same request: the next queued outfit if there is
  // one (no AI call), otherwise a new batch from the stored candidates,
  // searching further once those run out.
  private async reroll(ctx: RepromptContext): Promise<RouteResult> {
    const requirements = ctx.latest.requirements as Requirements;
    let lists = ctx.latest.candidates as CandidateLists;
    const shownKeys = new Set(ctx.shownOutfits.map(comboKey));

    const queue = [...(ctx.session.queuedOutfits as QueuedOutfit[])];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (next.itemIds.some((id) => ctx.banned.has(id)) || shownKeys.has(comboKey(next.itemIds))) continue;
      const items = await this.loadPieces(ctx.userId, next.itemIds);
      if (items.length !== next.itemIds.length) continue; // a piece was deleted from the closet
      // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
      this.logger.log(`[DEBUG AI] reroll served from queue (no AI call); ${queue.length} left`);
      // ==================== END TEST / DEBUG ====================
      return {
        outfit: { items, name: next.name, reasons: next.reasons },
        queue,
        requirements,
        candidates: lists,
        sentItemIds: ctx.latest.sentItemIds,
        banned: ctx.banned,
      };
    }

    // Favor candidates that haven't been sent yet.
    const alreadySent = new Set(ctx.turns.flatMap((turn) => turn.sentItemIds));
    let selection = await this.selectFor(ctx, { lists, alreadySent });
    if (selection.outfits.length === 0) {
      lists = await this.searchFurther(ctx.userId, requirements.items, lists);
      selection = await this.selectFor(ctx, { lists, alreadySent });
    }
    return fromSelection(selection, { requirements, candidates: lists, banned: ctx.banned });
  }

  // "Different shoes": keep the other pieces, ban the ones being replaced,
  // and choose new ones of the same types from the stored candidates.
  private async swap(ctx: RepromptContext, swapTypes: string[]): Promise<RouteResult> {
    const requirements = ctx.latest.requirements as Requirements;
    let lists = ctx.latest.candidates as CandidateLists;
    const swapping = new Set(swapTypes);
    const replaced = ctx.current.filter((piece) => piece.type !== null && swapping.has(piece.type));
    const banned = new Set([...ctx.banned, ...replaced.map((piece) => piece.id)]);

    if (!hasChoices(onlyTypes(lists, swapTypes), banned)) {
      lists = await this.searchFurther(ctx.userId, requirements.items.filter((item) => swapping.has(item.type)), lists);
      if (!hasChoices(onlyTypes(lists, swapTypes), banned)) {
        throw new UnprocessableEntityException(`StyleMe couldn't find other ${swapTypes.join(' or ')} options in your closet.`);
      }
    }

    const fixed = await this.outfitPlanning.loadCandidates(
      ctx.userId,
      ctx.current.filter((piece) => !replaced.includes(piece)).map((piece) => piece.id),
    );
    const selection = await this.selectFor(ctx, { lists: onlyTypes(lists, swapTypes), fixed, banned });
    return fromSelection(selection, { requirements, candidates: lists, banned });
  }

  // "Add a jacket", "no hat", "blue shoes instead", "more formal": edit the
  // requirements, search again for the added or changed types, then either
  // build around the rest of the outfit (keepRest) or pick a whole new one.
  private async refine(ctx: RepromptContext, edits: RefineEdits): Promise<RouteResult> {
    const before = ctx.latest.requirements as Requirements;
    const searchItems = [...edits.change, ...edits.add];
    const searchTypes = new Set(searchItems.map((item) => item.type));
    const removed = new Set(edits.remove);

    const requirements: Requirements = {
      items: [
        ...before.items.filter((item) => !removed.has(item.type) && !searchTypes.has(item.type)),
        ...searchItems,
      ],
    };
    let lists: CandidateLists = { ...(ctx.latest.candidates as CandidateLists) };
    for (const type of [...removed, ...searchTypes]) delete lists[type];

    if (searchItems.length > 0) {
      // AI (Gemini embedding): embeds the new descriptions so the closet can be
      // searched for them.
      const vectors = await this.queryExpansion.embedTexts(searchItems.map((item) => item.semantic_query));
      const found = await this.outfitPlanning.findCandidates(
        ctx.userId,
        searchItems.map((item, i) => ({ type: item.type, embedding: vectors[i] })),
      );
      lists = { ...lists, ...found };
    }

    if (!edits.keepRest) {
      const selection = await this.selectFor(ctx, { lists });
      return fromSelection(selection, { requirements, candidates: lists, banned: ctx.banned });
    }

    // Keep the other pieces. The ones the user asked to replace with something
    // specific aren't suggested again.
    const replaced = ctx.current.filter(
      (piece) => piece.type !== null && (removed.has(piece.type) || searchTypes.has(piece.type)),
    );
    const banned = new Set([
      ...ctx.banned,
      ...replaced.filter((piece) => searchTypes.has(piece.type!)).map((piece) => piece.id),
    ]);
    const choices = onlyTypes(lists, [...searchTypes]);
    if (searchTypes.size > 0 && !hasChoices(choices, banned)) {
      throw new UnprocessableEntityException(
        `StyleMe couldn't find a matching ${[...searchTypes].join(' or ')} in your closet.`,
      );
    }
    const fixed = await this.outfitPlanning.loadCandidates(
      ctx.userId,
      ctx.current.filter((piece) => !replaced.includes(piece)).map((piece) => piece.id),
    );
    const selection = await this.selectFor(ctx, { lists: choices, fixed, banned });
    return fromSelection(selection, { requirements, candidates: lists, banned });
  }

  // A new direction ("actually it's for a wedding"): the full pipeline again,
  // with the feedback added to the request. Bans and the day's weather stay.
  private async restart(ctx: RepromptContext): Promise<RouteResult> {
    const request = ctx.message ? `${ctx.request}\nThe user then said: ${ctx.message}` : ctx.request;
    // AI (Gemini query expansion + embedding): same as the first request, with
    // the feedback included.
    const expanded = await this.queryExpansion.expandAndEmbedQuery(request, ctx.weather);
    const lists = await this.outfitPlanning.findCandidates(ctx.userId, expanded.items);
    const selection = await this.selectFor(ctx, { lists, request });
    return fromSelection(selection, { requirements: toRequirements(expanded.items), candidates: lists, banned: ctx.banned });
  }

  // ---- Helpers ----

  // Nest errors (404, 409, 422) pass through; anything else is a Gemini or
  // other unexpected failure, sent as 503 { message } like the weather route.
  private async withAiErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Outfit suggestion failed: ${(err as Error).message}`, (err as Error).stack);
      throw new ServiceUnavailableException({ message: AI_UNAVAILABLE });
    }
  }

  // Empty message: reroll, without an AI call. Otherwise ask the router; if
  // the router call fails, restart (the full pipeline handles any message).
  private async decideRoute(ctx: RepromptContext): Promise<RouteDecision> {
    if (!ctx.message) return { route: 'reroll' };
    try {
      return await this.router.route({
        originalPrompt: ctx.session.originalPrompt,
        currentOutfit: ctx.current.map((piece) => ({ type: piece.type, name: piece.name })),
        message: ctx.message,
      });
    } catch (err) {
      this.logger.warn(`Router failed, restarting instead: ${(err as Error).message}`);
      return { route: 'restart' };
    }
  }

  // The session's summary, updated with any turns that just fell out of the
  // last 5. A failed summary keeps the old one; it never blocks a reprompt.
  private async updateSummary(
    session: SessionWithTurns,
    turns: OutfitTurn[],
    window: { toSummarize: OutfitTurn[]; summarizedThrough: number },
    pieces: Map<string, SuggestionPiece>,
  ): Promise<{ text: string | null; through: number }> {
    const unchanged = { text: session.historySummary, through: session.summarizedThroughTurn };
    if (window.toSummarize.length === 0) return unchanged;
    try {
      const text = await this.historySummary.summarize(
        session.historySummary,
        window.toSummarize.map((turn) => ({
          turnNumber: turn.turnNumber,
          outfitName: turn.name,
          itemNames: turn.chosenItemIds.map((id) => pieces.get(id)?.name).filter((name) => name !== undefined),
          userReply: replyTo(turns, turn) || null,
        })),
      );
      return { text, through: window.summarizedThrough };
    } catch (err) {
      this.logger.warn(`History summary failed for session ${session.id}: ${(err as Error).message}`);
      return unchanged;
    }
  }

  // Picks which candidates to send (CANDIDATES_SENT_PER_TYPE per type, no
  // banned items), loads their photos, and asks Gemini for outfits.
  private async select(input: {
    userId: string;
    request: string;
    weather: Weather | null;
    lists: CandidateLists;
    fixed?: OutfitCandidate[];
    alreadySent?: Set<string>;
    banned?: Set<string>;
    shownOutfits?: string[][];
    softAvoidIds?: string[];
    history?: string | null;
  }): Promise<Selection> {
    const ids = pickToSend(input.lists, {
      perType: CANDIDATES_SENT_PER_TYPE,
      banned: input.banned,
      alreadySent: input.alreadySent,
    });
    const fixed = input.fixed ?? [];
    const candidates = ids.length > 0 ? await this.outfitPlanning.loadCandidates(input.userId, ids) : [];
    if (candidates.length === 0 && fixed.length === 0) return { outfits: [], missing: null, sentIds: [] };

    // AI (Gemini outfit selection): looks at the candidates' photos and details
    // (plus any fixed pieces and the conversation so far) and returns up to 3
    // complete outfits, each with a name and reasons.
    const { outfits, missing } = await this.outfitPlanning.selectOutfits({
      request: input.request,
      weather: input.weather,
      candidates,
      fixed,
      history: input.history,
      shownOutfits: input.shownOutfits,
      softAvoidIds: input.softAvoidIds,
      banned: input.banned,
    });
    return { outfits, missing, sentIds: candidates.map((c) => c.id) };
  }

  // select() with this reprompt's request, weather, history and what's been shown.
  private selectFor(
    ctx: RepromptContext,
    opts: { lists: CandidateLists; fixed?: OutfitCandidate[]; alreadySent?: Set<string>; banned?: Set<string>; request?: string },
  ): Promise<Selection> {
    return this.select({
      userId: ctx.userId,
      request: opts.request ?? ctx.request,
      weather: ctx.weather,
      lists: opts.lists,
      fixed: opts.fixed,
      alreadySent: opts.alreadySent,
      banned: opts.banned ?? ctx.banned,
      shownOutfits: ctx.shownOutfits,
      softAvoidIds: ctx.shownItemIds,
      history: ctx.history,
    });
  }

  // Searches again for these items, skipping everything already found, and
  // adds the new matches to the end of each type's list.
  private async searchFurther(userId: string, items: SearchItem[], lists: CandidateLists): Promise<CandidateLists> {
    if (items.length === 0) return lists;
    // AI (Gemini embedding): embeds the stored descriptions again (embeddings
    // aren't saved) to search past the candidates already used.
    const vectors = await this.queryExpansion.embedTexts(items.map((item) => item.semantic_query));
    const more = await this.outfitPlanning.findCandidates(
      userId,
      items.map((item, i) => ({ type: item.type, embedding: vectors[i] })),
      { excludeIds: Object.values(lists).flat().map((c) => c.itemId) },
    );
    const merged = { ...lists };
    for (const [type, extra] of Object.entries(more)) merged[type] = [...(merged[type] ?? []), ...extra];
    return merged;
  }

  // The user's items with what the response needs, in the order of ids.
  // Deleted items are left out.
  private async loadPieces(userId: string, ids: string[]): Promise<SuggestionPiece[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.item.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, name: true, category: true, type: true, imageKey: true, cutoutKey: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row) => row !== undefined)
      .map(({ imageKey, cutoutKey, ...piece }) => ({ ...piece, photoKey: cutoutKey ?? imageKey }));
  }

  // The forecast for the outfit's day (today when no date), or null without a
  // location or if it fails (no key, past the forecast range, API down).
  // Weather only improves the picks, so a failure never blocks a suggestion.
  private async dayWeather(location: Location, date?: string): Promise<Weather | null> {
    if (!location) return null;
    try {
      return await this.weather.getWeather({ ...location, date });
    } catch (err) {
      this.logger.warn(`Suggesting without weather: ${(err as Error).message}`);
      return null;
    }
  }
}

// The request as the prompts see it.
function requestText(occasion: string, date?: string): string {
  return date ? `${occasion}\nDate: ${date}` : occasion;
}

function toRequirements(items: SearchItem[]): Requirements {
  return { items: items.map(({ type, semantic_query }) => ({ type, semantic_query })) };
}

function toQueued(outfit: SelectedOutfit): QueuedOutfit {
  return { itemIds: outfit.items.map((item) => item.id), name: outfit.name, reasons: outfit.reasons };
}

// The first outfit becomes the turn and the rest are queued. 422 if there are none.
function fromSelection(
  selection: Selection,
  rest: Pick<RouteResult, 'requirements' | 'candidates' | 'banned'>,
): RouteResult {
  const [first, ...others] = selection.outfits;
  if (!first) throw new UnprocessableEntityException(selection.missing ?? NO_NEW_OUTFITS);
  return { ...rest, outfit: first, queue: others.map(toQueued), sentItemIds: selection.sentIds };
}

// Just these types' candidate lists.
function onlyTypes(lists: CandidateLists, types: string[]): CandidateLists {
  return Object.fromEntries(types.filter((type) => lists[type]).map((type) => [type, lists[type]]));
}

function hasChoices(lists: CandidateLists, banned: Set<string>): boolean {
  return Object.values(lists).some((list) => list.some((c) => !banned.has(c.itemId)));
}

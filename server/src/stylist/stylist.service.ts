import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { GeminiHelpers } from '../gemini/helpers';
import { OutfitPlanningService, type OutfitCandidate } from '../gemini/outfit-planning/service';
import { QueryExpansionService } from '../gemini/query-expansion/service';
import { CATEGORY_TO_CLIENT } from '../items/item-mappings';
import { S3Service } from '../s3/s3.service';
import { WeatherService, type Weather } from '../weather/weather.service';
import { OUTFIT_DETAILS_INSTRUCTIONS, alreadyShownText } from './outfit-selection/prompt';
import { buildOutfitSuggestionSchema } from './outfit-selection/schema';

// What POST /api/stylist/outfit returns. Matches OutfitSuggestion in
// client/src/services/stylist.ts exactly.
export type OutfitSuggestion = {
  suggestionId: string; // identifies this outfit, for excludeSuggestionIds
  name: string; // e.g. "Easy layers for class"
  reasons: string[]; // 2-4 short reasons, written to the user
  items: {
    id: string; // Item id
    name: string;
    category: string | null; // the app's name, e.g. 'tops' (null if untagged)
    type: string | null; // garment type, e.g. 't-shirt'
    imageUrl: string; // signed URL for the cutout, or the original
  }[];
};

const NOT_ENOUGH_ITEMS = 'Not enough matching items in your closet to build an outfit';
const NO_NEW_OUTFITS = "That's every outfit StyleMe can find for this. Try describing the occasion differently.";
const FALLBACK_NAME = 'Your outfit';

// Order pieces are listed in, top of the outfit to the bottom.
const DISPLAY_ORDER: Category[] = ['Outerwear', 'Top', 'OnePiece', 'Sets', 'Bottoms', 'Shoes', 'Accessory'];

// The Stylist tab. Uses Javier's pieces for searching the closet and loading
// photos, and his outfit prompt for choosing; adds a name, a list of reasons,
// and "Try another suggestion" support on top.
@Injectable()
export class StylistService {
  private readonly logger = new Logger(StylistService.name);

  constructor(
    private readonly helpers: GeminiHelpers,
    private readonly queryExpansion: QueryExpansionService,
    private readonly outfitPlanning: OutfitPlanningService,
    private readonly s3: S3Service,
    private readonly weather: WeatherService,
  ) {}

  // Expand the request, find matching closet items, then have Gemini pick one
  // complete outfit the user hasn't seen yet. 422 when there isn't one.
  async suggestOutfit(
    userId: string,
    userRequest: string,
    excludeSuggestionIds: string[],
    context: { location: { lat: number; lon: number } | null; date?: string } = { location: null },
  ): Promise<OutfitSuggestion> {
    // Fetched first, so the expansion already picks clothes for the day.
    const weather = await this.dayWeather(context.location, context.date);

    // AI (Gemini query expansion + embedding): turns the request and the day's
    // weather into garment types with photo-like descriptions, embedded so the
    // closet can be searched by meaning.
    const expanded = await this.queryExpansion.expandAndEmbedQuery(userRequest, weather);

    const ids = await this.outfitPlanning.findCandidates(userId, expanded.items);
    if (ids.length === 0) throw new UnprocessableEntityException(NOT_ENOUGH_ITEMS);

    const candidates = await this.outfitPlanning.loadCandidates(userId, ids);
    if (candidates.length === 0) throw new UnprocessableEntityException(NOT_ENOUGH_ITEMS);

    // Outfits already shown, as item ids. Only ones made of these candidates
    // matter, since Gemini can only pick from them.
    const candidateIds = new Set(candidates.map((c) => c.id));
    const excluded = new Set(excludeSuggestionIds);
    const shownBefore = [...excluded]
      .map(fromSuggestionId)
      .filter((list): list is string[] => list !== null && list.every((id) => candidateIds.has(id)));

    return this.selectSuggestion(userRequest, candidates, shownBefore, excluded, weather);
  }

  // ---- Helpers ----

  // The forecast for the outfit's day (today when no date), or null without a
  // location or if it fails (no key, past the forecast range, API down).
  // Weather only improves the picks, so a failure never blocks a suggestion.
  private async dayWeather(location: { lat: number; lon: number } | null, date?: string): Promise<Weather | null> {
    if (!location) return null;
    try {
      return await this.weather.getWeather({ ...location, date });
    } catch (err) {
      this.logger.warn(`Suggesting without weather: ${(err as Error).message}`);
      return null;
    }
  }

  // Same request Javier's selectOutfit sends (his prompt and the candidate
  // photos), plus outfits to avoid and the name/reasons instructions.
  private async selectSuggestion(
    userRequest: string,
    candidates: OutfitCandidate[],
    shownBefore: string[][],
    excluded: Set<string>,
    weather: Weather | null,
  ): Promise<OutfitSuggestion> {
    const parts = this.outfitPlanning.buildSelectionParts(userRequest, candidates, weather);
    if (shownBefore.length > 0) parts.push({ text: alreadyShownText(shownBefore) });
    parts.push({ text: OUTFIT_DETAILS_INSTRUCTIONS });

    const response = await this.helpers.ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildOutfitSuggestionSchema(candidates.map((c) => c.id)),
      },
    });
    const text = response.text ?? '';

    let selection: { outfit?: string[]; name?: string; reasons?: string[] };
    try {
      selection = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned invalid JSON: ${text || '(empty)'}`);
    }

    // Only candidates, each once. The schema's enum should already ensure this.
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const chosen = [...new Set(selection.outfit ?? [])]
      .map((id) => byId.get(id))
      .filter((c): c is OutfitCandidate => c !== undefined);
    const reasons = (selection.reasons ?? [])
      .filter((r) => typeof r === 'string' && r.trim())
      .map((r) => r.trim())
      .slice(0, 4);

    // The schema can't express completeness, so check it here. When Gemini
    // couldn't build one, its reason says what's missing.
    if (!isCompleteOutfit(chosen)) {
      throw new UnprocessableEntityException(reasons[0] || NOT_ENOUGH_ITEMS);
    }

    const suggestionId = toSuggestionId(chosen.map((c) => c.id));
    if (excluded.has(suggestionId)) throw new UnprocessableEntityException(NO_NEW_OUTFITS);

    chosen.sort((a, b) => displayRank(a) - displayRank(b));
    const items = await Promise.all(
      chosen.map(async (c) => ({
        id: c.id,
        name: c.name,
        category: c.category ? CATEGORY_TO_CLIENT[c.category as Category] ?? null : null,
        type: c.type,
        // The same photo Gemini saw: the cutout, or the original.
        imageUrl: await this.s3.getDownloadUrl(c.photoKey),
      })),
    );

    return {
      suggestionId,
      name: selection.name?.trim() || FALLBACK_NAME,
      reasons,
      items,
    };
  }
}

// Complete means a OnePiece, or a Top and Bottoms. Everything else is optional.
// Matches the rule in Javier's prompt and his isCompleteOutfit.
function isCompleteOutfit(items: OutfitCandidate[]): boolean {
  const categories = new Set(items.map((item) => item.category));
  return categories.has('OnePiece') || (categories.has('Top') && categories.has('Bottoms'));
}

// Position in DISPLAY_ORDER; unknown or missing categories go last.
function displayRank(item: OutfitCandidate): number {
  const i = DISPLAY_ORDER.indexOf(item.category as Category);
  return i === -1 ? DISPLAY_ORDER.length : i;
}

// Nothing is saved, so a suggestionId is just the outfit's item ids, sorted
// and encoded. The same items always give the same id, which is how
// excludeSuggestionIds (and later the accept/feedback routes) recognize it.
function toSuggestionId(itemIds: string[]): string {
  return Buffer.from([...itemIds].sort().join(',')).toString('base64url');
}

// The item ids inside a suggestionId, or null if it isn't one of ours
// (e.g. the app's old "fixture-0" ids).
function fromSuggestionId(suggestionId: string): string[] | null {
  const ids = Buffer.from(suggestionId, 'base64url').toString('utf8').split(',');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return ids.length > 0 && ids.every((id) => uuid.test(id)) ? ids : null;
}
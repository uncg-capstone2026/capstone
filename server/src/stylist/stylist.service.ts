import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { GeminiHelpers } from '../gemini/helpers';
import { OutfitPlanningService, type OutfitCandidate } from '../gemini/outfit-planning/service';
import { QueryExpansionService } from '../gemini/query-expansion/service';
import { CATEGORY_TO_CLIENT } from '../items/item-mappings';
import { S3Service } from '../s3/s3.service';
import { OUTFIT_NAME_INSTRUCTIONS } from './outfit-selection/prompt';
import { buildNamedOutfitSchema } from './outfit-selection/schema';

// What POST /api/stylist/outfit returns: one named outfit and why it works.
export type NamedOutfit = {
  name: string;
  reason: string;
  items: {
    itemId: string;
    name: string;
    category: string | null; // the app's name, e.g. 'tops' (null if untagged)
    type: string | null; // garment type, e.g. 't-shirt'
    imageUrl: string; // signed URL for the cutout, or the original
  }[];
};

const NOT_ENOUGH_ITEMS = 'Not enough matching items in your closet to build an outfit';
const FALLBACK_NAME = 'Your outfit';

// Order pieces are listed in, top of the outfit to the bottom.
const DISPLAY_ORDER: Category[] = ['Outerwear', 'Top', 'OnePiece', 'Sets', 'Bottoms', 'Shoes', 'Accessory'];

// The Stylist tab. Uses Javier's pieces for searching the closet and loading
// photos, and his outfit prompt for choosing; adds a name to the result.
@Injectable()
export class StylistService {
  constructor(
    private readonly helpers: GeminiHelpers,
    private readonly queryExpansion: QueryExpansionService,
    private readonly outfitPlanning: OutfitPlanningService,
    private readonly s3: S3Service,
  ) {}

  // Expand the request, find matching closet items, then have Gemini pick one
  // complete outfit and name it. 422 when the closet doesn't have enough.
  async planOutfit(userId: string, userRequest: string): Promise<NamedOutfit> {
    const expanded = await this.queryExpansion.expandAndEmbedQuery(userRequest);

    const ids = await this.outfitPlanning.findCandidates(userId, expanded.items);
    if (ids.length === 0) throw new UnprocessableEntityException(NOT_ENOUGH_ITEMS);

    const candidates = await this.outfitPlanning.loadCandidates(userId, ids);
    if (candidates.length === 0) throw new UnprocessableEntityException(NOT_ENOUGH_ITEMS);

    return this.selectNamedOutfit(userRequest, candidates);
  }

  // ---- Helpers ----

  // Same request Javier's selectOutfit sends (his prompt and the candidate
  // photos), plus the name instructions and a schema that includes a name.
  private async selectNamedOutfit(userRequest: string, candidates: OutfitCandidate[]): Promise<NamedOutfit> {
    const parts = this.outfitPlanning.buildSelectionParts(userRequest, candidates);
    parts.push({ text: OUTFIT_NAME_INSTRUCTIONS });

    const response = await this.helpers.ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildNamedOutfitSchema(candidates.map((c) => c.id)),
      },
    });
    const text = response.text ?? '';

    let selection: { outfit?: string[]; name?: string; reason?: string };
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
    const reason = selection.reason?.trim() ?? '';

    // The schema can't express completeness, so check it here.
    if (!isCompleteOutfit(chosen)) {
      throw new UnprocessableEntityException(reason || NOT_ENOUGH_ITEMS);
    }

    chosen.sort((a, b) => displayRank(a) - displayRank(b));
    const items = await Promise.all(
      chosen.map(async (c) => ({
        itemId: c.id,
        name: c.name,
        category: c.category ? CATEGORY_TO_CLIENT[c.category as Category] ?? null : null,
        type: c.type,
        // The same photo Gemini saw: the cutout, or the original.
        imageUrl: await this.s3.getDownloadUrl(c.photoKey),
      })),
    );

    return {
      name: selection.name?.trim() || FALLBACK_NAME,
      reason,
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
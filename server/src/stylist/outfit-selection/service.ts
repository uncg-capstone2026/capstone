import { Injectable } from '@nestjs/common';
import type { Part } from '@google/genai';
import { GeminiHelpers } from '../../gemini/helpers';
import { STYLIST_SELECTION_PROMPT } from './prompt';
import { buildStylistSelectionSchema } from './schema';

// One closet item as the model sees it: a details line, plus its photo if it loaded.
export type OutfitCandidate = {
  id: string;
  details: string;
  image?: { data: Buffer; mimeType: string };
};

export type SelectedOutfit = { itemIds: string[]; name: string; reasons: string[] };

// Asks Gemini to pick outfits from the candidates found by Javier's
// OutfitPlanningService.findCandidates.
@Injectable()
export class OutfitSelectionService {
  constructor(private readonly helpers: GeminiHelpers) {}

  // Up to 3 outfits, best first. shownBefore lists outfits (as item ids) the
  // user has already seen.
  async selectOutfits(request: string, candidates: OutfitCandidate[], shownBefore: string[][]): Promise<SelectedOutfit[]> {
    const parts: Part[] = [
      { text: STYLIST_SELECTION_PROMPT },
      { text: `User request:\n${request}` },
    ];
    if (shownBefore.length > 0) {
      parts.push({
        text: `Already shown (don't repeat these exact outfits):\n${shownBefore
          .map((ids) => `- ${ids.join(', ')}`)
          .join('\n')}`,
      });
    }
    parts.push({ text: 'Candidates:' });
    for (const candidate of candidates) {
      parts.push({ text: candidate.details });
      if (candidate.image) {
        parts.push({
          inlineData: {
            mimeType: candidate.image.mimeType,
            data: candidate.image.data.toString('base64'),
          },
        });
      }
    }

    const response = await this.helpers.ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildStylistSelectionSchema(candidates.map((c) => c.id)),
      },
    });
    const text = response.text ?? '';

    let parsed: { outfits?: SelectedOutfit[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned invalid JSON: ${text || '(empty)'}`);
    }

    // The schema's enum should already prevent unknown ids; check anyway.
    const validIds = new Set(candidates.map((c) => c.id));
    return (parsed.outfits ?? [])
      .filter(
        (o) =>
          Array.isArray(o.itemIds) &&
          o.itemIds.length > 0 &&
          o.itemIds.every((id) => validIds.has(id)) &&
          typeof o.name === 'string' &&
          o.name.trim() !== '' &&
          Array.isArray(o.reasons),
      )
      .map((o) => ({
        itemIds: [...new Set(o.itemIds)],
        name: o.name.trim(),
        reasons: o.reasons.filter((r) => typeof r === 'string' && r.trim()).slice(0, 4),
      }));
  }
}
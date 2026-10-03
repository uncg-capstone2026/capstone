import { ApiError, apiPost, SessionExpiredError } from '@/services/api';
import { listItems, type ClothingCategory } from '@/services/items';
import { toDateKey } from '@/utils/dates';

// The server routes below aren't built yet (see PLAN.md section 7). Until they are, the
// fixture builds a suggestion from the user's own closet so the screen can be tested.
const USE_STYLIST_FIXTURE = true;

export type OutfitRequest = {
  date: Date;
  occasion: string; // where they're headed or what they're going for
  excludeSuggestionIds?: string[]; // suggestions already shown, for "Try another suggestion"
};

export type SuggestedPiece = {
  id: string; // Item id
  name: string;
  category: ClothingCategory;
  type: string | null;
  imageUrl: string; // signed URL for the cutout, or the original until it's ready
};

// POST /api/stylist/outfit -> one outfit built from the user's closet, using that day's weather.
export type OutfitSuggestion = {
  suggestionId: string;
  name: string; // e.g. "Soft layers for a rainy dinner"
  reasons: string[]; // 2-4 short reasons: weather, occasion, the user's preferences
  items: SuggestedPiece[];
};

export type AcceptOutfitRequest = {
  suggestionId: string;
  itemIds: string[];
  name: string; // the outfit's name
  eventName: string; // what the user called the occasion
  date: Date;
};

export type RejectOutfitRequest = {
  suggestionId: string;
  itemIds: string[];
  feedback: string; // what the user would rather wear
};

export async function styleOutfit(request: OutfitRequest): Promise<OutfitSuggestion> {
  if (USE_STYLIST_FIXTURE) return fixtureSuggestion(request);
  try {
    return await apiPost<OutfitSuggestion>('/api/stylist/outfit', {
      date: toDateKey(request.date),
      occasion: request.occasion,
      excludeSuggestionIds: request.excludeSuggestionIds ?? [],
    });
  } catch (e) {
    throw stylistError(e, 'StyleMe could not put an outfit together. Please try again.');
  }
}

// POST /api/stylist/outfit/accept: saves the Outfit and a CalendarEntry for the day, and logs
// the accept so StyleMe learns what worked.
export async function acceptOutfit(request: AcceptOutfitRequest): Promise<{ outfitId: string }> {
  if (USE_STYLIST_FIXTURE) {
    await wait(400);
    return { outfitId: `fixture-outfit-${request.suggestionId}` };
  }
  try {
    return await apiPost<{ outfitId: string }>('/api/stylist/outfit/accept', {
      ...request,
      date: toDateKey(request.date),
    });
  } catch (e) {
    throw stylistError(e, 'Could not save this outfit. Please try again.');
  }
}

// POST /api/stylist/outfit/feedback: saves the answer to Style Preferences.
export async function rejectOutfit(request: RejectOutfitRequest): Promise<void> {
  if (USE_STYLIST_FIXTURE) {
    await wait(400);
    return;
  }
  try {
    await apiPost<void>('/api/stylist/outfit/feedback', request);
  } catch (e) {
    throw stylistError(e, 'Could not save your answer. Please try again.');
  }
}

function stylistError(e: unknown, fallback: string): Error {
  if (e instanceof SessionExpiredError) return e;
  // 503 is the AI or weather service being down; its message is safe to show.
  if (e instanceof ApiError && e.status === 503 && e.serverMessage) return new Error(e.serverMessage);
  return new Error(fallback);
}

// ---- Fixture ----

const FIXTURE_REASONS = [
  'Covered layers and closed shoes for the light rain.',
  'Relaxed but put-together, which suits the occasion.',
  'Leans on the soft neutrals you wear most.',
];

// One of each piece the stylist needs, taken from the closet: a top and bottoms (or a
// one-piece), shoes, and an accessory if there is one. Each new request rotates which
// item of each category is used, so "Try another suggestion" shows something different.
async function fixtureSuggestion(request: OutfitRequest): Promise<OutfitSuggestion> {
  const closet = await listItems();
  const round = request.excludeSuggestionIds?.length ?? 0;
  const pick = (category: ClothingCategory) => {
    const matches = closet.filter((item) => item.category === category);
    return matches.length > 0 ? matches[round % matches.length] : undefined;
  };

  const onePiece = pick('one-piece');
  const top = pick('tops');
  const bottoms = pick('bottoms');
  const base = top && bottoms ? [top, bottoms] : onePiece ? [onePiece] : [];
  const shoes = pick('shoes');
  if (base.length === 0 || !shoes) {
    throw new Error('Add a top and bottoms (or a dress) and some shoes so StyleMe can build an outfit.');
  }
  const accessory = pick('accessories');
  const items = [...base, shoes, ...(accessory ? [accessory] : [])];

  await wait(600);
  return {
    suggestionId: `fixture-${round}`,
    name: 'Easy layers for the evening',
    reasons: FIXTURE_REASONS,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category as ClothingCategory,
      type: null,
      imageUrl: item.imageUrl,
    })),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

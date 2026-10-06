import { ApiError, apiPost, SessionExpiredError } from '@/services/api';
import { listItems, type ClosetItem, type ClothingCategory } from '@/services/items';
import { toDateKey } from '@/utils/dates';

// POST /api/stylist/outfit is live. The accept and feedback routes aren't built yet (see
// PLAN.md section 7), so those two still fake success. Set USE_OUTFIT_FIXTURE to true to build
// suggestions from the user's own closet instead, without calling the AI.
const USE_OUTFIT_FIXTURE = false;
const USE_ACCEPT_FEEDBACK_FIXTURE = true;

export type OutfitRequest = {
  date: Date;
  occasion: string; // where they're headed or what they're going for
  excludeSuggestionIds?: string[]; // suggestions already shown, for "Try another suggestion"
};

export type SuggestedPiece = {
  id: string; // Item id
  name: string;
  category: ClothingCategory | null; // null if the item hasn't been tagged
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
  if (USE_OUTFIT_FIXTURE) return fixtureSuggestion(request);
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
  if (USE_ACCEPT_FEEDBACK_FIXTURE) {
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
  if (USE_ACCEPT_FEEDBACK_FIXTURE) {
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
  if (__DEV__) console.warn('Stylist request failed:', e instanceof ApiError ? `${e.status} ${e.serverMessage}` : e);
  // 422 is the closet not having enough for an outfit, and 503 is the AI or weather service
  // being down. Both messages are written for the user.
  if (e instanceof ApiError && (e.status === 422 || e.status === 503) && e.serverMessage) {
    return new Error(e.serverMessage);
  }
  return new Error(fallback);
}

// ---- Fixture ----

const FIXTURE_REASONS = [
  'Comfortable enough to sit through classes and walk across campus.',
  'Casual but put-together, which suits a regular school day.',
  'Leans on the easy everyday pieces you wear most.',
];

// Builds the suggestion from fixtureOutfit. Each new request rotates which item of each
// category is used, so "Try another suggestion" shows something different.
async function fixtureSuggestion(request: OutfitRequest): Promise<OutfitSuggestion> {
  const round = request.excludeSuggestionIds?.length ?? 0;
  const items = fixtureOutfit(await listItems(), round);
  if (!items) {
    throw new Error('Add a top and bottoms (or a dress) and some shoes so StyleMe can build an outfit.');
  }

  await wait(600);
  return {
    suggestionId: `fixture-${round}`,
    name: 'Casual day at school',
    reasons: FIXTURE_REASONS,
    items,
  };
}

// One of each piece an outfit needs, taken from the closet: a top and bottoms (or a
// one-piece), shoes, and an accessory if there is one. `round` picks which item of each
// category is used. Null when the closet can't make an outfit.
function fixtureOutfit(closet: ClosetItem[], round = 0): SuggestedPiece[] | null {
  const pick = (category: ClothingCategory) => {
    const matches = closet.filter((item) => item.category === category);
    return matches.length > 0 ? matches[round % matches.length] : undefined;
  };

  const onePiece = pick('one-piece');
  const top = pick('tops');
  const bottoms = pick('bottoms');
  const base = top && bottoms ? [top, bottoms] : onePiece ? [onePiece] : [];
  const shoes = pick('shoes');
  if (base.length === 0 || !shoes) return null;
  const accessory = pick('accessories');
  const items = [...base, shoes, ...(accessory ? [accessory] : [])];

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    type: null,
    imageUrl: item.imageUrl,
  }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

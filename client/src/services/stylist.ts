import { ApiError, apiPost, SessionExpiredError } from '@/services/api';
import { listItems, type ClosetItem, type ClothingCategory } from '@/services/items';
import { saveFixtureOutfit } from '@/services/outfits';
import { toDateKey } from '@/utils/dates';

// All the Stylist routes are live. Set USE_OUTFIT_FIXTURE to true to build suggestions from
// the user's own closet instead, without calling the AI, and USE_ACCEPT_FEEDBACK_FIXTURE to save
// accepted outfits into the Outfits fixture instead of the server.
const USE_OUTFIT_FIXTURE = false;
const USE_ACCEPT_FEEDBACK_FIXTURE = false;

export type OutfitRequest = {
  date: Date;
  occasion: string; // where they're headed or what they're going for
};

// "Not for me": the next outfit in the same session, adjusted to the user's answer.
export type RepromptRequest = {
  sessionId: string;
  message?: string; // e.g. "different shoes"; left out for a plain "Try another"
};

export type SuggestedPiece = {
  id: string; // Item id
  name: string;
  category: ClothingCategory | null; // null if the item hasn't been tagged
  type: string | null;
  imageUrl: string; // signed URL for the cutout, or the original until it's ready
};

// POST /api/stylist/outfit -> one outfit built from the user's closet, using that day's weather.
// The first one starts a session; each reprompt adds a turn to it.
export type OutfitSuggestion = {
  sessionId: string; // same for every outfit in this conversation
  turnId: string; // this outfit
  suggestionId: string;
  name: string; // e.g. "Soft layers for a rainy dinner"
  reasons: string[]; // 2-4 short reasons: weather, occasion, the user's preferences
  items: SuggestedPiece[];
};

export type AcceptOutfitRequest = {
  sessionId: string;
  turnId: string;
  suggestionId: string;
  itemIds: string[];
  name: string; // the outfit's name
  eventName: string; // what the user called the occasion
  date: Date;
};

export async function styleOutfit(request: OutfitRequest): Promise<OutfitSuggestion> {
  if (USE_OUTFIT_FIXTURE) return fixtureSuggestion(request);
  try {
    return await apiPost<OutfitSuggestion>('/api/stylist/outfit', {
      date: toDateKey(request.date),
      occasion: request.occasion,
    });
  } catch (e) {
    throw stylistError(e, 'StyleMe could not put an outfit together. Please try again.');
  }
}

// POST /api/stylist/outfit/reprompt: the next outfit in the session. With a message, the AI
// adjusts the outfit to it ("different shoes", "more formal", "actually it's for a wedding").
// Without one it's a plain "Try another", often served instantly from a queue.
export async function repromptOutfit(request: RepromptRequest): Promise<OutfitSuggestion> {
  if (USE_OUTFIT_FIXTURE) return fixtureReprompt(request);
  try {
    return await apiPost<OutfitSuggestion>('/api/stylist/outfit/reprompt', request);
  } catch (e) {
    throw stylistError(e, 'StyleMe could not put an outfit together. Please try again.');
  }
}

// POST /api/stylist/outfit/accept: saves the Outfit and a CalendarEntry for the day, and
// closes the session.
export async function acceptOutfit(request: AcceptOutfitRequest): Promise<{ outfitId: string }> {
  if (USE_ACCEPT_FEEDBACK_FIXTURE) {
    // Save it to the Outfits fixture so it shows up in All saved outfits.
    const closet = await listItems();
    const outfitId = `fixture-outfit-${request.suggestionId}-${Date.now()}`;
    saveFixtureOutfit({
      id: outfitId,
      name: request.name,
      isFavorite: false,
      items: closet.filter((item) => request.itemIds.includes(item.id)).map(toSuggestedPiece),
    });
    return { outfitId };
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

export type TryOnResult = { imageUrl: string };

// Why a try-on failed, so the screen can offer the right next step: adding a try-on photo,
// retaking one the AI couldn't use, or trying again.
export class TryOnError extends Error {
  constructor(
    message: string,
    readonly reason: 'no-photo' | 'photo-unusable' | 'other',
  ) {
    super(message);
    this.name = 'TryOnError';
  }
}

// POST /api/stylist/try-on: a photo of the user wearing these items, from their try-on photo.
// Takes 10–30s. The URL lasts 24 hours and can't be fetched again, so don't keep it.
export async function tryOn(itemIds: string[]): Promise<TryOnResult> {
  try {
    return await apiPost<TryOnResult>('/api/stylist/try-on', { itemIds });
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e;
    if (__DEV__) console.warn('Try-on failed:', e instanceof ApiError ? `${e.status} ${e.serverMessage}` : e);
    if (e instanceof ApiError && e.serverMessage) {
      // 404 is either no try-on photo yet or an item no longer in the closet. 422 is the AI
      // not being able to use the photo, and its message is written for the user.
      if (e.status === 404 && /try-on photo/i.test(e.serverMessage)) {
        throw new TryOnError(e.serverMessage, 'no-photo');
      }
      if (e.status === 422) throw new TryOnError(e.serverMessage, 'photo-unusable');
      if (e.status === 404 || e.status === 503) throw new TryOnError(e.serverMessage, 'other');
    }
    throw new TryOnError("StyleMe couldn't create your try-on. Please try again.", 'other');
  }
}

function stylistError(e: unknown, fallback: string): Error {
  if (e instanceof SessionExpiredError) return e;
  if (__DEV__) console.warn('Stylist request failed:', e instanceof ApiError ? `${e.status} ${e.serverMessage}` : e);
  // These messages are written for the user: 404 a session or item that isn't theirs, 409 a
  // finished session or a reprompt already running, 422 nothing new to suggest (or not enough
  // in the closet), and 503 the AI being down.
  if (e instanceof ApiError && [404, 409, 422, 503].includes(e.status) && e.serverMessage) {
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

let fixtureRound = 0; // bumped by each fixture reprompt

// Builds the suggestion from fixtureOutfit. Each reprompt rotates which item of each
// category is used, so "Not for me" shows something different.
function fixtureSuggestion(_request: OutfitRequest): Promise<OutfitSuggestion> {
  fixtureRound = 0;
  return fixtureRoundSuggestion();
}

function fixtureReprompt(_request: RepromptRequest): Promise<OutfitSuggestion> {
  fixtureRound += 1;
  return fixtureRoundSuggestion();
}

async function fixtureRoundSuggestion(): Promise<OutfitSuggestion> {
  const round = fixtureRound;
  const items = fixtureOutfit(await listItems(), round);
  if (!items) {
    throw new Error('Add a top and bottoms (or a dress) and some shoes so StyleMe can build an outfit.');
  }

  await wait(600);
  return {
    sessionId: 'fixture',
    turnId: `fixture-turn-${round}`,
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

  return items.map(toSuggestedPiece);
}

function toSuggestedPiece(item: ClosetItem): SuggestedPiece {
  return { id: item.id, name: item.name, category: item.category, type: null, imageUrl: item.imageUrl };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

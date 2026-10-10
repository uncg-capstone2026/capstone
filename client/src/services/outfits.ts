import { ApiError, apiDelete, apiGet, apiPatch, apiPost, SessionExpiredError } from '@/services/api';
import type { SuggestedPiece } from '@/services/stylist';

// The outfit and collection routes are live. Set this to true to use an in-memory fixture
// instead. It starts empty; accepting a Stylist suggestion saves an outfit into it while
// USE_ACCEPT_FEEDBACK_FIXTURE in services/stylist.ts is on.
const USE_COLLECTIONS_FIXTURE = false;

// The routes for changing an outfit's pieces and scheduled dates are live. Set this to true to
// keep those changes in memory for the session instead, shown on top of what the server sends.
const USE_OUTFIT_EDITS_FIXTURE = false;

export const COLLECTION_NAME_MAX_LENGTH = 40;

// The two built-in lists open the same screen as a collection, with these ids.
export const ALL_OUTFITS_ID = 'all';
export const FAVORITES_ID = 'favorites';

const BUILT_IN_NAMES: Record<string, string> = {
  [ALL_OUTFITS_ID]: 'All saved outfits',
  [FAVORITES_ID]: 'Favorites',
};

// An outfit's pieces, laid out with FlatLay.
export type OutfitPreview = SuggestedPiece[];

// A day the outfit is planned for. An outfit can have any number, even two on the same day.
export type ScheduledDate = {
  id: string; // the calendar entry's id
  date: string; // YYYY-MM-DD
  eventName: string | null;
};

// GET /api/outfits
export type SavedOutfit = {
  id: string;
  name: string;
  isFavorite: boolean;
  timesWorn?: number;
  lastWorn?: string | null; // ISO date of the most recent day it was worn; null if never
  createdAt?: string;
  items: OutfitPreview;
};

// GET and PATCH /api/outfits/:id: one outfit plus its planned days and collections.
export type OutfitDetails = SavedOutfit & {
  scheduled: ScheduledDate[]; // past and upcoming, earliest first
  collections: { id: string; name: string }[]; // the user's collections it's in, most recently added first
};

export type OutfitCollection = {
  id: string;
  name: string;
  outfitCount: number;
  cover: OutfitPreview | null; // the most recently added outfit; null when the collection is empty
};

// GET /api/collections: everything the Outfits screen shows.
export type OutfitsOverview = {
  allOutfits: { count: number; cover: OutfitPreview | null };
  favorites: { count: number; cover: OutfitPreview | null }; // outfits with isFavorite
  collections: OutfitCollection[]; // newest first
};

// One collection's outfits, newest first. `id` can also be ALL_OUTFITS_ID or FAVORITES_ID.
export type CollectionDetails = {
  id: string;
  name: string;
  outfits: SavedOutfit[];
};

export function isBuiltInCollection(id: string): boolean {
  return id in BUILT_IN_NAMES;
}

export async function getOutfitsOverview(): Promise<OutfitsOverview> {
  if (USE_COLLECTIONS_FIXTURE) return fixtureOverview();
  try {
    return await apiGet<OutfitsOverview>('/api/collections');
  } catch (e) {
    throw collectionsError(e, 'Could not load your outfits. Please try again.');
  }
}

// GET /api/outfits (newest first), for All saved outfits and the "Add outfits" picker.
export async function listOutfits(): Promise<SavedOutfit[]> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    return fixtureOutfits;
  }
  try {
    return (await apiGet<SavedOutfit[]>('/api/outfits')).map(withEdits);
  } catch (e) {
    throw collectionsError(e, 'Could not load your outfits. Please try again.');
  }
}

// GET /api/outfits/:id, for the outfit details screen.
export async function getOutfit(id: string): Promise<OutfitDetails> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    const outfit = fixtureOutfits.find((o) => o.id === id);
    if (!outfit) throw new Error('This outfit no longer exists.');
    return detailsWithEdits(toFixtureDetails(outfit));
  }
  try {
    return detailsWithEdits(await apiGet<OutfitDetails>(`/api/outfits/${encodeURIComponent(id)}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new Error('This outfit no longer exists.');
    throw collectionsError(e, 'Could not load this outfit. Please try again.');
  }
}

// All saved outfits and Favorites come from GET /api/outfits; a user collection from
// GET /api/collections/:id.
export async function getCollection(id: string): Promise<CollectionDetails> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    return fixtureCollection(id);
  }
  try {
    if (id === ALL_OUTFITS_ID || id === FAVORITES_ID) {
      const query = id === FAVORITES_ID ? '?favorite=true' : '';
      const outfits = await apiGet<SavedOutfit[]>(`/api/outfits${query}`);
      return { id, name: BUILT_IN_NAMES[id], outfits: outfits.map(withEdits) };
    }
    const collection = await apiGet<CollectionDetails>(`/api/collections/${id}`);
    return { ...collection, outfits: collection.outfits.map(withEdits) };
  } catch (e) {
    throw collectionsError(e, 'Could not load this collection. Please try again.');
  }
}

// POST /api/collections: a new, empty collection.
export async function createCollection(name: string): Promise<OutfitCollection> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    checkFixtureName(name);
    const collection = { id: `fixture-collection-${Date.now()}`, name };
    fixtureCollections = [collection, ...fixtureCollections];
    fixtureMembers[collection.id] = [];
    return toFixtureCollection(collection);
  }
  try {
    return await apiPost<OutfitCollection>('/api/collections', { name });
  } catch (e) {
    throw collectionsError(e, 'Could not create this collection. Please try again.');
  }
}

// PATCH /api/collections/:id
export async function renameCollection(id: string, name: string): Promise<OutfitCollection> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    checkFixtureName(name, id);
    const existing = fixtureCollections.find((collection) => collection.id === id);
    if (!existing) throw new Error('This collection no longer exists.');
    const renamed = { ...existing, name };
    fixtureCollections = fixtureCollections.map((collection) => (collection.id === id ? renamed : collection));
    return toFixtureCollection(renamed);
  }
  try {
    return await apiPatch<OutfitCollection>(`/api/collections/${id}`, { name });
  } catch (e) {
    throw collectionsError(e, 'Could not rename this collection. Please try again.');
  }
}

// DELETE /api/collections/:id: removes the collection only. Its outfits stay in All saved outfits.
export async function deleteCollection(id: string): Promise<void> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    fixtureCollections = fixtureCollections.filter((collection) => collection.id !== id);
    delete fixtureMembers[id];
    return;
  }
  try {
    await apiDelete(`/api/collections/${id}`);
  } catch (e) {
    throw collectionsError(e, 'Could not delete this collection. Please try again.');
  }
}

// Favorites: PATCH /api/outfits/:id { isFavorite: true } for each outfit.
// A user collection: POST /api/collections/:id/outfits { outfitIds }.
export async function addOutfitsToCollection(id: string, outfitIds: string[]): Promise<void> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    if (id === FAVORITES_ID) {
      fixtureOutfits = fixtureOutfits.map((o) => (outfitIds.includes(o.id) ? { ...o, isFavorite: true } : o));
    } else {
      const members = fixtureMembers[id] ?? [];
      fixtureMembers[id] = [...outfitIds.filter((outfitId) => !members.includes(outfitId)), ...members];
    }
    return;
  }
  try {
    if (id === FAVORITES_ID) {
      await Promise.all(outfitIds.map((outfitId) => apiPatch(`/api/outfits/${outfitId}`, { isFavorite: true })));
    } else {
      await apiPost<void>(`/api/collections/${id}/outfits`, { outfitIds });
    }
  } catch (e) {
    throw collectionsError(e, 'Could not add these outfits. Please try again.');
  }
}

// Favorites: PATCH /api/outfits/:id { isFavorite: false }.
// A user collection: DELETE /api/collections/:id/outfits/:outfitId. The outfit itself stays.
export async function removeOutfitFromCollection(id: string, outfitId: string): Promise<void> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    if (id === FAVORITES_ID) {
      fixtureOutfits = fixtureOutfits.map((o) => (o.id === outfitId ? { ...o, isFavorite: false } : o));
    } else {
      fixtureMembers[id] = (fixtureMembers[id] ?? []).filter((memberId) => memberId !== outfitId);
    }
    return;
  }
  try {
    if (id === FAVORITES_ID) {
      await apiPatch(`/api/outfits/${outfitId}`, { isFavorite: false });
    } else {
      await apiDelete(`/api/collections/${id}/outfits/${outfitId}`);
    }
  } catch (e) {
    throw collectionsError(e, 'Could not remove this outfit. Please try again.');
  }
}

// DELETE /api/outfits/:id: deletes the outfit everywhere, including every collection.
export async function deleteOutfit(outfitId: string): Promise<void> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    fixtureOutfits = fixtureOutfits.filter((outfit) => outfit.id !== outfitId);
    for (const id of Object.keys(fixtureMembers)) {
      fixtureMembers[id] = fixtureMembers[id].filter((memberId) => memberId !== outfitId);
    }
    return;
  }
  try {
    await apiDelete(`/api/outfits/${outfitId}`);
  } catch (e) {
    throw collectionsError(e, 'Could not delete this outfit. Please try again.');
  }
}

// PATCH /api/outfits/:id { isFavorite }
export async function setOutfitFavorite(outfitId: string, isFavorite: boolean): Promise<void> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    fixtureOutfits = fixtureOutfits.map((o) => (o.id === outfitId ? { ...o, isFavorite } : o));
    return;
  }
  try {
    await apiPatch(`/api/outfits/${outfitId}`, { isFavorite });
  } catch (e) {
    throw collectionsError(e, 'Could not update your favorites. Please try again.');
  }
}

// Complete means a one-piece (or set), or a top and bottoms. Pieces can't be removed past this.
export function isCompleteOutfit(pieces: OutfitPreview): boolean {
  const categories = new Set(pieces.map((piece) => piece.category));
  return (
    categories.has('one-piece') || categories.has('sets') || (categories.has('tops') && categories.has('bottoms'))
  );
}

// PATCH /api/outfits/:id { itemIds } -> the updated outfit. Replaces the outfit's pieces
// (add, remove or swap); the server lays them out again, so use the pieces it sends back.
export async function updateOutfitItems(outfitId: string, pieces: OutfitPreview): Promise<OutfitDetails> {
  if (USE_OUTFIT_EDITS_FIXTURE) {
    fixturePieces[outfitId] = pieces;
    return getOutfit(outfitId);
  }
  try {
    return await apiPatch<OutfitDetails>(`/api/outfits/${outfitId}`, { itemIds: pieces.map((piece) => piece.id) });
  } catch (e) {
    throw collectionsError(e, 'Could not update this outfit. Please try again.');
  }
}

// POST /api/outfits/:id/schedule { date, eventName } -> the new entry. Always adds one, so an
// outfit can be planned for several events.
export async function scheduleOutfit(
  outfitId: string,
  entry: { date: string; eventName: string | null },
): Promise<ScheduledDate> {
  if (USE_OUTFIT_EDITS_FIXTURE) {
    await wait(300);
    const created = { id: `fixture-entry-${Date.now()}`, ...entry };
    fixtureSchedules[outfitId] = [...(fixtureSchedules[outfitId] ?? []), created];
    return created;
  }
  try {
    return await apiPost<ScheduledDate>(`/api/outfits/${outfitId}/schedule`, entry);
  } catch (e) {
    throw collectionsError(e, 'Could not schedule this outfit. Please try again.');
  }
}

// DELETE /api/outfits/:id/schedule/:entryId: removes that one date only.
export async function unscheduleOutfit(outfitId: string, entryId: string): Promise<void> {
  if (USE_OUTFIT_EDITS_FIXTURE) {
    await wait(300);
    fixtureSchedules[outfitId] = (fixtureSchedules[outfitId] ?? []).filter((entry) => entry.id !== entryId);
    return;
  }
  try {
    await apiDelete(`/api/outfits/${outfitId}/schedule/${entryId}`);
  } catch (e) {
    throw collectionsError(e, 'Could not remove this date. Please try again.');
  }
}

export function formatOutfitCount(count: number): string {
  return `${count} ${count === 1 ? 'outfit' : 'outfits'}`;
}

function collectionsError(e: unknown, fallback: string): Error {
  if (e instanceof SessionExpiredError) return e;
  if (__DEV__) console.warn('Collections request failed:', e instanceof ApiError ? `${e.status} ${e.serverMessage}` : e);
  // 400 is an invalid name and 409 a name that's already used. Both messages are for the user.
  if (e instanceof ApiError && (e.status === 400 || e.status === 409) && e.serverMessage) {
    return new Error(e.serverMessage);
  }
  return new Error(fallback);
}

// ---- Fixture ----

// USE_OUTFIT_EDITS_FIXTURE: each outfit's edited pieces and scheduled dates, by outfit id.
const fixturePieces: Record<string, OutfitPreview> = {};
const fixtureSchedules: Record<string, ScheduledDate[]> = {};

function withEdits(outfit: SavedOutfit): SavedOutfit {
  if (!USE_OUTFIT_EDITS_FIXTURE) return outfit;
  return { ...outfit, items: fixturePieces[outfit.id] ?? outfit.items };
}

function detailsWithEdits(outfit: OutfitDetails): OutfitDetails {
  if (!USE_OUTFIT_EDITS_FIXTURE) return outfit;
  return {
    ...outfit,
    items: fixturePieces[outfit.id] ?? outfit.items,
    scheduled: fixtureSchedules[outfit.id] ?? outfit.scheduled,
  };
}

// Kept for the session so changes show up when the screens reload. Outfits and members are
// newest first.
let fixtureOutfits: SavedOutfit[] = [];
let fixtureCollections: { id: string; name: string }[] = [];
const fixtureMembers: Record<string, string[]> = {}; // collection id -> outfit ids

// Called by the Stylist's accept fixture, so accepted suggestions show up in All saved outfits.
export function saveFixtureOutfit(outfit: SavedOutfit) {
  fixtureOutfits = [outfit, ...fixtureOutfits];
}

async function fixtureOverview(): Promise<OutfitsOverview> {
  await wait(300);
  const favorites = fixtureOutfits.filter((outfit) => outfit.isFavorite);
  return {
    allOutfits: { count: fixtureOutfits.length, cover: fixtureOutfits[0]?.items ?? null },
    favorites: { count: favorites.length, cover: favorites[0]?.items ?? null },
    collections: fixtureCollections.map(toFixtureCollection),
  };
}

function fixtureCollection(id: string): CollectionDetails {
  if (id === ALL_OUTFITS_ID) return { id, name: BUILT_IN_NAMES[id], outfits: fixtureOutfits };
  if (id === FAVORITES_ID) {
    return { id, name: BUILT_IN_NAMES[id], outfits: fixtureOutfits.filter((outfit) => outfit.isFavorite) };
  }
  const collection = fixtureCollections.find((c) => c.id === id);
  if (!collection) throw new Error('This collection no longer exists.');
  return { ...collection, outfits: fixtureMemberOutfits(id) };
}

function toFixtureDetails(outfit: SavedOutfit): OutfitDetails {
  const collections = fixtureCollections
    .filter((collection) => (fixtureMembers[collection.id] ?? []).includes(outfit.id))
    .map(({ id, name }) => ({ id, name }));
  return { ...outfit, scheduled: [], collections };
}

function toFixtureCollection(collection: { id: string; name: string }): OutfitCollection {
  const outfits = fixtureMemberOutfits(collection.id);
  return { ...collection, outfitCount: outfits.length, cover: outfits[0]?.items ?? null };
}

function fixtureMemberOutfits(id: string): SavedOutfit[] {
  return (fixtureMembers[id] ?? []).flatMap((outfitId) => fixtureOutfits.filter((outfit) => outfit.id === outfitId));
}

function checkFixtureName(name: string, exceptId?: string) {
  const isTaken = fixtureCollections.some(
    (collection) => collection.id !== exceptId && collection.name.toLowerCase() === name.toLowerCase(),
  );
  if (isTaken) throw new Error('You already have a collection with this name.');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

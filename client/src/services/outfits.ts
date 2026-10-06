import { ApiError, apiDelete, apiGet, apiPatch, apiPost, SessionExpiredError } from '@/services/api';
import type { SuggestedPiece } from '@/services/stylist';

// The collection routes aren't built yet (see PLAN.md section 9). Until they are, the Outfits
// screen uses an in-memory fixture with no saved outfits and no collections until the user
// creates some.
const USE_COLLECTIONS_FIXTURE = true;

export const COLLECTION_NAME_MAX_LENGTH = 40;

// An outfit's pieces, laid out with FlatLay.
export type OutfitPreview = SuggestedPiece[];

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

export async function getOutfitsOverview(): Promise<OutfitsOverview> {
  if (USE_COLLECTIONS_FIXTURE) return fixtureOverview();
  try {
    return await apiGet<OutfitsOverview>('/api/collections');
  } catch (e) {
    throw collectionsError(e, 'Could not load your outfits. Please try again.');
  }
}

// POST /api/collections: a new, empty collection.
export async function createCollection(name: string): Promise<OutfitCollection> {
  if (USE_COLLECTIONS_FIXTURE) {
    await wait(300);
    checkFixtureName(name);
    const collection = { id: `fixture-collection-${Date.now()}`, name, outfitCount: 0, cover: null };
    fixtureCollections = [collection, ...fixtureCollections];
    return collection;
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
    return renamed;
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
    return;
  }
  try {
    await apiDelete(`/api/collections/${id}`);
  } catch (e) {
    throw collectionsError(e, 'Could not delete this collection. Please try again.');
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

// Kept for the session so creating, renaming and deleting show up when the screen reloads.
let fixtureCollections: OutfitCollection[] = [];

// No outfits are saved until the Stylist's accept route is live (PLAN.md section 7).
async function fixtureOverview(): Promise<OutfitsOverview> {
  await wait(300);
  return {
    allOutfits: { count: 0, cover: null },
    favorites: { count: 0, cover: null },
    collections: fixtureCollections,
  };
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

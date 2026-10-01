import { isBackendConfigured } from '@/config/api';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, SessionExpiredError } from '@/services/api';
import { uploadToS3, type PickedPhoto } from '@/services/photos';

export type ClothingCategory =
  | 'tops'
  | 'bottoms'
  | 'outerwear'
  | 'shoes'
  | 'accessories'
  | 'one-piece'
  | 'sets';

export type ClosetItem = {
  id: string;
  name: string;
  category: ClothingCategory | null; // null until the item is tagged; it only shows under "All"
  imageUrl: string; // signed S3 URL for the cutout (Item.cutoutKey), or the original until it's ready
  isFavorite: boolean;
};

export type ClothingFit = 'slim' | 'regular' | 'relaxed' | 'oversized';

// GET /api/items/:id: the closet fields plus the item's tags. Untagged items have nulls.
export type ClothingItemDetails = ClosetItem & {
  type: string | null; // e.g. "t-shirt", "jeans", "sneakers"
  cut: string | null; // e.g. "crew neck"
  colorHex: string[]; // 0-3 values like "#1A2B3C"
  pattern: string | null;
  material: string | null;
  season: string | null;
  formality: string | null;
  fit: ClothingFit | null;
  sourceURL: string | null; // the product page, for items added from a link
  createdAt: string; // ISO date
};

// PATCH /api/items/:id: only the fields sent are changed. isFavorite, name and colorHex can't
// be null; the others are cleared by sending null. The server rejects any other field.
export type ClothingItemChanges = {
  isFavorite?: boolean;
  name?: string; // 1-60 characters
  colorHex?: string[]; // up to 3
  category?: ClothingCategory | null;
  fit?: ClothingFit | null;
  type?: string | null; // these six: up to 50 characters
  cut?: string | null;
  pattern?: string | null;
  material?: string | null;
  season?: string | null;
  formality?: string | null;
};

export type ClosetFilter ='all' | 'favorites' | ClothingCategory;

export const CLOSET_FILTERS: { key: ClosetFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'tops', label: 'Tops' },
  { key: 'bottoms', label: 'Bottoms' },
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessories', label: 'Accessories' },
  { key: 'one-piece', label: 'One-Piece' },
  { key: 'sets', label: 'Sets' },
];

export function filterItems(items: ClosetItem[], filter: ClosetFilter): ClosetItem[] {
  if (filter === 'all') return items;
  if (filter === 'favorites') return items.filter((item) => item.isFavorite);
  return items.filter((item) => item.category === filter);
}

// Until EXPO_PUBLIC_API_URL is set, the closet is empty.
// GET /api/items returns the signed-in user's items.
export async function listItems(): Promise<ClosetItem[]> {
  if (!isBackendConfigured) return [];

  try {
    return await apiGet<ClosetItem[]>('/api/items');
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e;
    throw new Error('Could not load your closet. Please try again.');
  }
}

// GET /api/items/:id. imageUrl is freshly signed, so use it rather than the closet's copy.
export async function getItem(id: string): Promise<ClothingItemDetails> {
  try {
    return await apiGet<ClothingItemDetails>(`/api/items/${encodeURIComponent(id)}`);
  } catch (e) {
    throw itemError(e, 'Could not load this item. Please try again.');
  }
}

// PATCH /api/items/:id -> the updated item.
export async function updateItem(id: string, changes: ClothingItemChanges): Promise<ClothingItemDetails> {
  try {
    return await apiPatch<ClothingItemDetails>(`/api/items/${encodeURIComponent(id)}`, changes);
  } catch (e) {
    throw itemError(e, 'Could not save your changes. Please try again.');
  }
}

// DELETE /api/items/:id. The server also removes it from outfits and collections.
export async function deleteItem(id: string): Promise<void> {
  try {
    await apiDelete(`/api/items/${encodeURIComponent(id)}`);
  } catch (e) {
    throw itemError(e, 'Could not delete this item. Please try again.');
  }
}

// 404 means the item is gone (or isn't this user's). 400 is a validation message worth showing.
function itemError(e: unknown, fallback: string): Error {
  if (e instanceof SessionExpiredError) return e;
  if (e instanceof ApiError && e.status === 404) return new Error('This item no longer exists.');
  if (e instanceof ApiError && e.status === 400 && e.serverMessage) return new Error(e.serverMessage);
  return new Error(fallback);
}

// Clothing photo upload flow. The app never holds AWS credentials:
//   1. POST /api/items/photo/upload-url { contentType, fileName } -> { uploadUrl, key }
//   2. PUT the image bytes straight to S3 at uploadUrl
//   3. POST /api/items/photo { key } -> { itemId }
//      (backend saves imageKey, then cuts the piece out and stores it in S3 as cutoutKey.
//       This takes a few seconds. If the cutout fails, the item keeps the original photo.
//       AI tagging of category, color and fit comes later, so new items are untagged.)
// The server only accepts JPEG, PNG and WebP (400 otherwise).
// Until EXPO_PUBLIC_API_URL is set, this resolves locally so the flow stays walkable.
export async function uploadItemPhoto(photo: PickedPhoto): Promise<string> {
  if (!isBackendConfigured) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return 'local-placeholder';
  }

  const { uploadUrl, key } = await apiPost<{ uploadUrl: string; key: string }>(
    '/api/items/photo/upload-url',
    { contentType: photo.mimeType, fileName: photo.fileName },
  );
  await uploadToS3(uploadUrl, photo);
  const { itemId } = await apiPost<{ itemId: string }>('/api/items/photo', { key });
  return itemId;
}

// TODO: backend route not built yet. It should fetch the product page, save the product
// image to S3, and return the details for the user to confirm.
export async function importItemFromLink(_url: string): Promise<void> {
  throw new Error('Adding from links is coming soon.');
}

export function isLikelyUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

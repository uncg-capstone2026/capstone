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

export type ClothingFit = 'fitted' | 'slim' | 'regular' | 'loose' | 'oversized';

// The fit slider's steps, tightest first.
export const FIT_STEPS: { fit: ClothingFit; label: string; description: string }[] = [
  { fit: 'fitted', label: 'Fitted', description: 'Hugs the body closely all over.' },
  { fit: 'slim', label: 'Slim', description: 'Close to the body, with a little room to move.' },
  { fit: 'regular', label: 'Regular', description: 'The standard cut, neither tight nor loose.' },
  { fit: 'loose', label: 'Loose', description: 'Extra room through the body; drapes away from you.' },
  { fit: 'oversized', label: 'Oversized', description: 'Deliberately sized up for a roomy, slouchy look.' },
];

// Common cuts offered in the Cut dropdown, by category. Users can also add their own.
const GENERAL_CUTS = ['Classic', 'Cropped', 'Longline', 'Asymmetric'];
export const COMMON_CUTS: Record<ClothingCategory, string[]> = {
  tops: ['Crew neck', 'V-neck', 'Scoop neck', 'Turtleneck', 'Mock neck', 'Collared', 'Henley', 'Off-shoulder', 'Halter', 'Cropped', 'Longline'],
  bottoms: ['Straight leg', 'Skinny', 'Slim', 'Wide leg', 'Bootcut', 'Flare', 'Tapered', 'Barrel', 'A-line', 'Pencil', 'Pleated'],
  outerwear: ['Single-breasted', 'Double-breasted', 'Cropped', 'Longline', 'Hooded', 'Bomber', 'Trench', 'Shacket'],
  shoes: ['Low-top', 'High-top', 'Ankle', 'Knee-high', 'Slip-on', 'Lace-up', 'Platform', 'Pointed toe'],
  accessories: GENERAL_CUTS,
  'one-piece': ['A-line', 'Bodycon', 'Shift', 'Wrap', 'Slip', 'Fit and flare', 'Shirt dress', 'Jumpsuit', 'Romper'],
  sets: GENERAL_CUTS,
};

// GET /api/items/:id: the closet fields plus the item's tags. Untagged items have nulls.
export type ClothingItemDetails = ClosetItem & {
  type: string | null; // one of CLOTHING_TYPE_OPTIONS, or older free text from before the AI tagging
  cut: string | null; // e.g. "crew neck"
  colorHex: string[]; // 0-3 values like "#1A2B3C"
  pattern: string | null;
  material: string | null;
  season: string | null;
  formality: string | null;
  fit: ClothingFit | null;
  sourceURL: string | null; // the product page, for items added from a link
  createdAt: string; // ISO date
  // Not sent by the server yet (see PLAN.md). The details screen shows placeholders until they are.
  timesWorn?: number;
  timesWornThisMonth?: number;
  excludeFromSuggestions?: boolean;
  outfits?: { id: string; name: string }[]; // the user's outfits that include this item
};

// GET /api/items/:id/color-grid: a small downscaled copy of the item's image for the color
// dropper. pixels is row-major, `width * height` long; null where the cutout is transparent.
export type ItemColorGrid = {
  width: number;
  height: number;
  pixels: (string | null)[];
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
  excludeFromSuggestions?: boolean; // not accepted by the server yet
};

export type ClosetFilter = 'all' | 'favorites' | ClothingCategory;

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

// The categories an item can have, for the Category dropdown.
export const CATEGORY_OPTIONS = CLOSET_FILTERS.filter(
  (f): f is { key: ClothingCategory; label: string } => f.key !== 'all' && f.key !== 'favorites',
);

// The garment types the AI tags items with, for the Type dropdown. A copy of CLOTHING_TYPES in
// server/src/gemini/constants.ts: keep the two in sync. The AI stylist only searches by these
// exact values, so there's no custom option.
export const CLOTHING_TYPE_OPTIONS = [
  { value: 't-shirt', label: 'T-shirt' },
  { value: 'tank-top', label: 'Tank top' },
  { value: 'blouse', label: 'Blouse' },
  { value: 'button-up-shirt', label: 'Button-up shirt' },
  { value: 'long-sleeve-shirt', label: 'Long-sleeve shirt' },
  { value: 'sweater', label: 'Sweater' },
  { value: 'hoodie', label: 'Hoodie' },
  { value: 'cardigan', label: 'Cardigan' },
  { value: 'jeans', label: 'Jeans' },
  { value: 'dress-pants', label: 'Dress pants' },
  { value: 'sweat-pants', label: 'Sweatpants' },
  { value: 'leggings', label: 'Leggings' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'skirt', label: 'Skirt' },
  { value: 'dress', label: 'Dress' },
  { value: 'blazer', label: 'Blazer' },
  { value: 'jacket', label: 'Jacket' },
  { value: 'coat', label: 'Coat' },
  { value: 'sneakers', label: 'Sneakers' },
  { value: 'boots', label: 'Boots' },
  { value: 'heels', label: 'Heels' },
  { value: 'flats', label: 'Flats' },
  { value: 'sandals', label: 'Sandals' },
  { value: 'hat', label: 'Hat' },
] as const;

export type ClothingType = (typeof CLOTHING_TYPE_OPTIONS)[number]['value'];

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
    return withNewFitNames(await apiGet<ClothingItemDetails>(`/api/items/${encodeURIComponent(id)}`));
  } catch (e) {
    throw itemError(e, 'Could not load this item. Please try again.');
  }
}

// PATCH /api/items/:id -> the updated item.
export async function updateItem(id: string, changes: ClothingItemChanges): Promise<ClothingItemDetails> {
  try {
    return withNewFitNames(
      await apiPatch<ClothingItemDetails>(`/api/items/${encodeURIComponent(id)}`, changes),
    );
  } catch (e) {
    throw itemError(e, 'Could not save your changes. Please try again.');
  }
}

// The server still calls "loose" "relaxed" until its Fit enum is migrated (see PLAN.md).
// Until then it also rejects "fitted" and "loose" with a 400.
function withNewFitNames(item: ClothingItemDetails): ClothingItemDetails {
  return (item.fit as string) === 'relaxed' ? { ...item, fit: 'loose' } : item;
}

// GET /api/items/:id/color-grid, for the color dropper. Not built on the server yet, so a 404
// usually means the route is missing rather than the item.
export async function getItemColorGrid(id: string): Promise<ItemColorGrid> {
  try {
    return await apiGet<ItemColorGrid>(`/api/items/${encodeURIComponent(id)}/color-grid`);
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e;
    throw new Error("The color dropper isn't available yet.");
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
//      (backend saves imageKey, cuts the piece out and stores it in S3 as cutoutKey, then
//       AI-tags it (name, type, category, colors, pattern, material, season, formality, fit)
//       and embeds it for the stylist. This takes a few seconds. Each step can fail on its
//       own: the item is still created, keeping the original photo or untagged fields.)
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

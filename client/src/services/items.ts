import { isBackendConfigured } from '@/config/api';
import { apiGet, apiPost, SessionExpiredError } from '@/services/api';
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

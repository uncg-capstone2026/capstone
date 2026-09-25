import { API_BASE_URL, isBackendConfigured } from '@/config/api';
import { apiPost, uploadToS3, type PickedPhoto } from '@/services/photos';

// NOTE for the server: Prisma's Item model has no `isFavorite` flag and its Category enum
// has no `Sets` value yet. Both are used here client-side and need adding to the schema.
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
  category: ClothingCategory;
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
// TODO: backend route not built yet. GET /api/items should return the signed-in user's items.
export async function listItems(): Promise<ClosetItem[]> {
  if (!isBackendConfigured) return [];

  const response = await fetch(`${API_BASE_URL}/api/items`, {
    // TODO: add the session's Authorization header once auth is wired up.
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Could not load your closet. Please try again.');
  }
  return (await response.json()) as ClosetItem[];
}

// Clothing photo upload flow. The app never holds AWS credentials:
//   1. POST /api/items/photo/upload-url { contentType, fileName } -> { uploadUrl, key }
//   2. PUT the image bytes straight to S3 at uploadUrl
//   3. POST /api/items/photo { key } -> { itemId }
//      (backend saves imageKey, cuts the piece out, stores it in S3 as cutoutKey,
//       and fills in category, color and fit)
// Until EXPO_PUBLIC_API_URL is set, this resolves locally so the flow stays walkable.
// TODO: backend routes not built yet (POST /uploads/clothing covers part of step 1).
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

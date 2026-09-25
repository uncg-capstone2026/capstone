import { API_BASE_URL, isBackendConfigured } from '@/config/api';

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
  imageUrl: string;
  aspectRatio?: number; // width / height; drives the masonry tile height
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

export const DEFAULT_ITEM_ASPECT_RATIO = 3 / 4;

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

export const CLOTHING_TYPES = [
  't-shirt',
  'tank-top',
  'blouse',
  'button-up-shirt',
  'long-sleeve-shirt',
  'sweater',
  'hoodie',
  'cardigan',
  'jeans',
  'dress-pants',
  'sweat-pants',
  'leggings',
  'shorts',
  'skirt',
  'dress',
  'blazer',
  'jacket',
  'coat',
  'sneakers',
  'boots',
  'heels',
  'flats',
  'sandals',
  'hat',
] as const;

export const FORMALITY_LEVELS = [
  'athletic',
  'casual',
  'smart-casual',
  'business-casual',
  'business-formal',
  'cocktail',
  'formal',
] as const;

export type ClothingType = (typeof CLOTHING_TYPES)[number];

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;

export type Season = (typeof SEASONS)[number];

export type FormalityLevel = (typeof FORMALITY_LEVELS)[number];

export const EMBEDDING_MODEL = 'gemini-embedding-2';

export const EMBEDDING_DIMENSIONS = 768;

export const EMBEDDABLE_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

// How many closest closet items to keep for each expanded item.
export const CANDIDATES_PER_TYPE = 5;

// Most candidate items (and so photos) sent to Gemini in one outfit request.
// Keeps memory use and the inline request size bounded.
export const MAX_OUTFIT_CANDIDATES = 25;

export const PATTERNS = [
  'solid',
  'striped',
  'plaid',
  'floral',
  'graphic',
  'polka-dot',
  'camo',
  'other',
] as const;

// Matches the Fit enum in prisma/schema.prisma.
export const FITS = ['Slim', 'Regular', 'Relaxed', 'Oversized'] as const;

// Matches the Category enum in prisma/schema.prisma.
export type Category =
  'Top' | 'Bottoms' | 'Outerwear' | 'Shoes' | 'Accessory' | 'OnePiece';

export const CATEGORY_BY_TYPE: Record<ClothingType, Category> = {
  't-shirt': 'Top',
  'tank-top': 'Top',
  blouse: 'Top',
  'button-up-shirt': 'Top',
  'long-sleeve-shirt': 'Top',
  sweater: 'Top',
  hoodie: 'Top',
  cardigan: 'Top',
  jeans: 'Bottoms',
  'dress-pants': 'Bottoms',
  'sweat-pants': 'Bottoms',
  leggings: 'Bottoms',
  shorts: 'Bottoms',
  skirt: 'Bottoms',
  dress: 'OnePiece',
  blazer: 'Outerwear',
  jacket: 'Outerwear',
  coat: 'Outerwear',
  sneakers: 'Shoes',
  boots: 'Shoes',
  heels: 'Shoes',
  flats: 'Shoes',
  sandals: 'Shoes',
  hat: 'Accessory',
};

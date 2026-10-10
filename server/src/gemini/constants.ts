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

// Tagging and outfit selection.
export const MAIN_MODEL = 'gemini-flash-latest';

// Small, fast calls that don't look at photos: query expansion, the reprompt
// router and the history summary.
export const FAST_MODEL = 'gemini-flash-lite-latest';

export const EMBEDDING_MODEL = 'gemini-embedding-2';

export const EMBEDDING_DIMENSIONS = 768;

export const EMBEDDABLE_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

// Closest closet items kept per expanded type (stored on the turn, so rerolls
// can reach past the first few without searching again).
export const CANDIDATES_STORED_PER_TYPE = 10;

// Of those, how many per type are sent to Gemini (with their photos) in one
// selection. There's no total cap; the expansion keeps the type list short.
export const CANDIDATES_SENT_PER_TYPE = 4;

// Outfits asked for in one selection call. The first is shown; the rest are
// queued on the session so a reroll needs no AI call.
export const OUTFITS_PER_SELECTION = 3;

// Turns included in full in the selection prompt; older ones are summarized.
export const RECENT_TURNS_IN_FULL = 5;

// Turns allowed in one session before the user has to start a new request.
export const MAX_TURNS_PER_SESSION = 20;

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

export type Pattern = (typeof PATTERNS)[number];

// Matches the Fit enum in prisma/schema.prisma.
export const FITS = ['Slim', 'Regular', 'Relaxed', 'Oversized'] as const;

export type FitValue = (typeof FITS)[number];

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

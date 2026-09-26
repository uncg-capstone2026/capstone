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

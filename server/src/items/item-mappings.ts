import type { Category, Fit } from '@prisma/client';

// Database enum value -> the app's value. Record<...> makes TypeScript error
// here if a value is ever added to the Prisma enum without being mapped.
export const CATEGORY_TO_CLIENT: Record<Category, string> = {
  Top: 'tops',
  Bottoms: 'bottoms',
  Outerwear: 'outerwear',
  Shoes: 'shoes',
  Accessory: 'accessories',
  OnePiece: 'one-piece',
  Sets: 'sets',
};

// Lowercase, matching ClothingFit in the app (client/src/services/items.ts).
export const FIT_TO_CLIENT: Record<Fit, string> = {
  Fitted: 'fitted',
  Slim: 'slim',
  Regular: 'regular',
  Loose: 'loose',
  Oversized: 'oversized',
};

// Lists of valid app values, used to validate edits.
export const CLIENT_CATEGORIES = Object.values(CATEGORY_TO_CLIENT);
export const CLIENT_FITS = Object.values(FIT_TO_CLIENT);

// App value -> database value (the reverse of the maps above).
function fromClient<K extends string>(map: Record<K, string>, value: string): K {
  const match = (Object.keys(map) as K[]).find((k) => map[k] === value);
  if (!match) throw new Error(`Unknown value: ${value}`); // validation prevents this
  return match;
}

export const categoryFromClient = (value: string) => fromClient(CATEGORY_TO_CLIENT, value);
export const fitFromClient = (value: string) => fromClient(FIT_TO_CLIENT, value);

// The AI's fit tag -> database value. Also accepts the older 'Relaxed' (now
// 'Loose'), so tagging works whether or not FITS in gemini/constants.ts has
// been updated yet. Anything unknown becomes null.
const FIT_FROM_AI: Record<string, Fit> = {
  Fitted: 'Fitted',
  Slim: 'Slim',
  Regular: 'Regular',
  Loose: 'Loose',
  Relaxed: 'Loose',
  Oversized: 'Oversized',
};
export const fitFromAi = (value: string | null | undefined): Fit | null =>
  (value && FIT_FROM_AI[value]) || null;
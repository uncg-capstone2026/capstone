export type OutfitRequest = {
  date: Date;
  occasion: string; // where they're headed or what they're going for
};

// TODO: backend route not built yet. Something like
// POST /api/stylist/outfit { date: 'YYYY-MM-DD', occasion } -> one outfit built from the
// user's closet, using that day's weather. The chat isn't saved.
export async function styleOutfit(_request: OutfitRequest): Promise<void> {
  throw new Error('Outfit styling is coming soon.');
}

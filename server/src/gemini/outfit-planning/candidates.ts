// Pure helpers for choosing which candidates to send to Gemini and checking
// the outfits it sends back. No database, S3 or Gemini calls, so they can be
// unit tested directly.

// One closet item found by the search; score is cosine distance (lower is closer).
export type ScoredCandidate = { itemId: string; score: number };

// Search results by garment type, closest first. Stored on each turn.
export type CandidateLists = Record<string, ScoredCandidate[]>;

// What validateOutfits needs to know about an item.
type OutfitPiece = { id: string; category: string | null };

// One outfit as Gemini returned it, before checking.
export type RawOutfit = { outfit?: string[]; name?: string; reasons?: string[] };

// A checked outfit: fixed pieces first, then the chosen ones.
export type ValidOutfit<T> = { items: T[]; name: string; reasons: string[] };

// Identifies an outfit by its items, in any order: the sorted ids, encoded.
// Also used as the app's suggestionId, so it must stay stable.
export function comboKey(itemIds: string[]): string
{
  return Buffer.from([...itemIds].sort().join(',')).toString('base64url');
}

// Complete means a OnePiece, or a Top and Bottoms. Everything else is optional.
export function isCompleteOutfit(items: OutfitPiece[]): boolean
{
  const categories = new Set(items.map((item) => item.category));
  return categories.has('OnePiece') || (categories.has('Top') && categories.has('Bottoms'));
}

// The candidate ids to send to Gemini: up to perType per type, never banned.
// Items already sent in an earlier selection are mostly skipped so new pieces
// get a chance, but up to keepSent of the best ones stay so good pieces can be
// recombined. On the first selection nothing has been sent, so it's simply
// the closest perType of each type.
export function pickToSend(
  lists: CandidateLists,
  opts: { perType: number; banned?: Set<string>; alreadySent?: Set<string>; keepSent?: number },
): string[]
{
  const banned = opts.banned ?? new Set<string>();
  const sent = opts.alreadySent ?? new Set<string>();
  const keepSent = opts.keepSent ?? 2;
  const picked = new Set<string>();

  for (const list of Object.values(lists)) {
    const allowed = list.map((c) => c.itemId).filter((id) => !banned.has(id) && !picked.has(id));
    const sentBefore = allowed.filter((id) => sent.has(id));
    const fresh = allowed.filter((id) => !sent.has(id));

    const chosen = [...sentBefore.slice(0, keepSent), ...fresh].slice(0, opts.perType);
    // Not enough new ones: top up with the other items sent before.
    for (const id of sentBefore.slice(keepSent)) {
      if (chosen.length >= opts.perType) break;
      chosen.push(id);
    }
    chosen.forEach((id) => picked.add(id));
  }
  return [...picked];
}

// Checks Gemini's outfits and turns ids back into items:
// - only known candidate ids, each once; fixed pieces are added to every outfit
// - drops outfits that are incomplete, contain a banned item, were shown
//   before (shownKeys, from comboKey), or repeat another outfit in the batch
// - trims names and keeps 1-4 non-empty reasons
export function validateOutfits<T extends OutfitPiece>(
  raw: RawOutfit[],
  opts: { candidates: T[]; fixed?: T[]; shownKeys?: Set<string>; banned?: Set<string> },
): ValidOutfit<T>[]
{
  const fixed = opts.fixed ?? [];
  const fixedIds = new Set(fixed.map((item) => item.id));
  const banned = opts.banned ?? new Set<string>();
  const byId = new Map(opts.candidates.map((item) => [item.id, item]));
  const seen = new Set(opts.shownKeys ?? []);
  const valid: ValidOutfit<T>[] = [];

  for (const outfit of raw) {
    const chosen: T[] = [];
    for (const id of new Set(outfit.outfit ?? [])) {
      const item = byId.get(id);
      if (item && !fixedIds.has(id)) chosen.push(item);
    }
    const items = [...fixed, ...chosen];
    if (items.length === 0 || !isCompleteOutfit(items)) continue;
    if (items.some((item) => banned.has(item.id))) continue;

    const key = comboKey(items.map((item) => item.id));
    if (seen.has(key)) continue;
    seen.add(key);

    const reasons = (outfit.reasons ?? [])
      .filter((r) => typeof r === 'string' && r.trim())
      .map((r) => r.trim())
      .slice(0, 4);
    valid.push({ items, name: outfit.name?.trim() ?? '', reasons });
  }
  return valid;
}

import { CLOTHING_TYPES } from '../constants';

// A garment to search for: the same shape the query expansion returns.
export type SearchItem = { type: string; semantic_query: string };

export type RefineEdits = {
  add: SearchItem[];
  remove: string[];
  change: SearchItem[];
  keepRest: boolean; // keep the current outfit's other pieces
};

// What the reprompt does next. See ai/repromptimplementation.md, Phase 4.
export type RouteDecision =
  | { route: 'reroll' }
  | { route: 'swap'; swapTypes: string[] }
  | { route: 'refine'; edits: RefineEdits }
  | { route: 'restart' };

// The router's answer as Gemini returned it, before checking.
export type RawRouteDecision = {
  route?: string;
  swap_types?: string[];
  edits?: {
    add?: SearchItem[];
    remove?: string[];
    change?: SearchItem[];
    keep_rest?: boolean;
  } | null;
};

const isClothingType = (type: unknown): type is string =>
  typeof type === 'string' && (CLOTHING_TYPES as readonly string[]).includes(type);

// Checks the router's answer against the current outfit. Anything it can't
// act on falls back: a swap with no matching pieces becomes a refine if the
// edits are usable, and anything else unusable becomes a restart (the full
// pipeline, which always works).
export function sanitizeRouteDecision(raw: RawRouteDecision, currentTypes: string[]): RouteDecision
{
  const current = new Set(currentTypes);
  const swapTypes = [...new Set((raw.swap_types ?? []).filter((t) => current.has(t)))];
  const edits = sanitizeEdits(raw.edits);

  switch (raw.route) {
    case 'reroll':
      return { route: 'reroll' };
    case 'swap':
      if (swapTypes.length > 0) return { route: 'swap', swapTypes };
      return edits ? { route: 'refine', edits } : { route: 'restart' };
    case 'refine':
      if (edits) return { route: 'refine', edits };
      return swapTypes.length > 0 ? { route: 'swap', swapTypes } : { route: 'restart' };
    default:
      return { route: 'restart' };
  }
}

// Valid types only, each once, with a non-empty description; a type being
// added or changed isn't also removed. null when nothing usable is left.
function sanitizeEdits(edits: RawRouteDecision['edits']): RefineEdits | null
{
  if (!edits) return null;
  const seen = new Set<string>();
  const searchItems = (items: SearchItem[] | undefined) =>
    (items ?? [])
      .filter((item) => isClothingType(item?.type) && item.semantic_query?.trim())
      .filter((item) => !seen.has(item.type) && seen.add(item.type))
      .map((item) => ({ type: item.type, semantic_query: item.semantic_query.trim() }));

  const change = searchItems(edits.change);
  const add = searchItems(edits.add);
  const remove = [...new Set((edits.remove ?? []).filter(isClothingType))].filter((t) => !seen.has(t));

  if (add.length === 0 && change.length === 0 && remove.length === 0) return null;
  return { add, remove, change, keepRest: edits.keep_rest !== false };
}

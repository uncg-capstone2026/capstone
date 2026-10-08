import type { Category } from '@prisma/client';
import { comboKey } from '../gemini/outfit-planning/candidates';
import { CATEGORY_TO_CLIENT } from '../items/item-mappings';
import type { S3Service } from '../s3/s3.service';

// What the stylist routes return. Matches OutfitSuggestion in
// client/src/services/stylist.ts, plus the session and turn ids for reprompts.
export type OutfitSuggestion = {
  sessionId?: string; // send back with a reprompt
  turnId?: string; // which outfit this is, e.g. for accepting it
  suggestionId: string; // the outfit's items, encoded (see comboKey); for excludeSuggestionIds
  name: string; // e.g. "Easy layers for class"
  reasons: string[]; // 2-4 short reasons, written to the user
  items: {
    id: string; // Item id
    name: string;
    category: string | null; // the app's name, e.g. 'tops' (null if untagged)
    type: string | null; // garment type, e.g. 't-shirt'
    imageUrl: string; // signed URL for the cutout, or the original
  }[];
};

// What toSuggestion needs to know about each piece.
export type SuggestionPiece = {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  photoKey: string; // the cutout, or the original
};

const FALLBACK_NAME = 'Your outfit';

// Order pieces are listed in, top of the outfit to the bottom.
const DISPLAY_ORDER: Category[] = ['Outerwear', 'Top', 'OnePiece', 'Sets', 'Bottoms', 'Shoes', 'Accessory'];

// Builds the response: pieces in display order, each with a signed URL for
// the same photo Gemini saw.
export async function toSuggestion(
  s3: S3Service,
  outfit: { items: SuggestionPiece[]; name: string; reasons: string[] },
  ids: { sessionId?: string; turnId?: string } = {},
): Promise<OutfitSuggestion>
{
  const pieces = [...outfit.items].sort((a, b) => displayRank(a) - displayRank(b));
  const items = await Promise.all(
    pieces.map(async (piece) => ({
      id: piece.id,
      name: piece.name,
      category: piece.category ? CATEGORY_TO_CLIENT[piece.category as Category] ?? null : null,
      type: piece.type,
      imageUrl: await s3.getDownloadUrl(piece.photoKey),
    })),
  );
  return {
    ...ids,
    suggestionId: comboKey(outfit.items.map((piece) => piece.id)),
    name: outfit.name || FALLBACK_NAME,
    reasons: outfit.reasons,
    items,
  };
}

// The item ids inside a suggestionId, or null if it isn't one of ours
// (e.g. the app's old "fixture-0" ids).
// Remove with excludeSuggestionIds once the app uses the reprompt route.
export function fromSuggestionId(suggestionId: string): string[] | null
{
  const ids = Buffer.from(suggestionId, 'base64url').toString('utf8').split(',');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return ids.length > 0 && ids.every((id) => uuid.test(id)) ? ids : null;
}

// Position in DISPLAY_ORDER; unknown or missing categories go last.
function displayRank(piece: SuggestionPiece): number
{
  const i = DISPLAY_ORDER.indexOf(piece.category as Category);
  return i === -1 ? DISPLAY_ORDER.length : i;
}

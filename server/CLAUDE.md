# Server: upload & outfit planning (current state)

What the server does today for these two features. Build the client against this only, and don't build for anything under "Not implemented".

## Upload
`POST /api/items/photo` `{ key: string }` → `{ itemId: string }`
- Responds only after background removal, AI tagging and embedding have finished, **whether or not each succeeded**. The item always exists. If a step failed, it just has no cutout and/or no tags.
- Items whose tagging or embedding failed never show up in outfits.

## Outfit planning
Design: `ai/repromptimplementation.md`. Every outfit shown is saved as a turn in a session (`OutfitSession` / `OutfitTurn`).

`POST /api/stylist/outfit` starts a session.
```ts
type StyleOutfitRequest = {
  occasion: string /* 1–300 chars */; date?: string /* 'YYYY-MM-DD' */;
  lat?: number; lon?: number;        // optional; enables weather-aware picks
  excludeSuggestionIds?: string[];   // old "Try another"; remove once the app uses /reprompt
};

type OutfitSuggestion = {
  sessionId: string;     // send back with /reprompt
  turnId: string;        // this outfit, e.g. for accepting it
  suggestionId: string;  // the outfit's items, encoded
  name: string;          // e.g. "Easy layers for class"
  reasons: string[];     // 2–4, written to the user; show as-is
  items: { id: string; name: string; category: string | null; type: string | null; imageUrl: string }[];
};
```
`POST /api/stylist/outfit/reprompt` `{ sessionId: string; message?: string /* ≤300 */ }` → `OutfitSuggestion`
- No message is "Try another" (served from a queue of extra outfits when possible, with no AI call).
- With a message, a router picks `reroll`, `swap` ("different shoes"), `refine` ("add a jacket", "more formal") or `restart` ("actually it's for a wedding").
- `swap` and a plain removal (`refine` with only "no hat") are also served from the queue when possible: first an outfit that only changes those pieces, otherwise any other queued outfit, which can change other pieces too. The user reprompts from there. Otherwise Gemini picks a replacement.

Both routes:
- One complete outfit: Top + Bottoms, or a OnePiece (dress). Shoes, outerwear and accessory are optional.
- Items with `excludeFromSuggestions: true` are never suggested, including ones marked partway through a session.
- `type` is the garment type (`'t-shirt'`, `'jeans'`); `category` is the app's name (`'tops'`).
- `imageUrl` is a signed URL to the cutout (or original), valid for **5 minutes**.
- With `lat`/`lon` on the first request, the day's forecast is fetched first, stored on the session, and given to every prompt.
- The user's style notes closest to the request (up to 10) are added to the prompts.
- A session with no activity for 24 hours is marked abandoned; reprompting or accepting it is a 409, so start a new one.
- Errors: 400 invalid body; 404 session not found; 409 session finished or another reprompt in progress; 422 not enough items / nothing new / 20-turn limit (show `serverMessage`); 503 AI unavailable (show `serverMessage`).

`POST /api/stylist/outfit/accept` `{ sessionId, turnId, suggestionId, itemIds, name, eventName, date }` → `{ outfitId }`
- "Looks right": saves the Outfit and a CalendarEntry for `date`, and closes the session (the turn becomes `accepted`, the session `completed`), all in one transaction.
- `sessionId` and `turnId` are required, from the suggestion being accepted.
- Errors: 400 invalid body; 404 session or an item isn't the user's; 409 session already finished, or `turnId` isn't its latest outfit.

## Try-on
`POST /api/stylist/try-on` `{ itemIds: string[] /* 1–8 */ }` → `{ imageUrl: string }`
- A photo of the user wearing those items, generated from their primary try-on photo. Send the pieces **on screen**, including swapped ones.
- Takes about 10–30s. `imageUrl` is a signed URL to a JPEG, valid for **24 hours**. Nothing is saved to the database, and the file is deleted by an S3 lifecycle rule (`tryon/` prefix), so it can't be fetched again later.
- Errors: 400 invalid body; 404 no try-on photo yet, or an item isn't in the closet (show `serverMessage`); 422 the photo couldn't be used, e.g. it doesn't show one person (show `serverMessage`); 503 AI unavailable (show `serverMessage`).

## Style memory
An hourly job (also run at startup) learns from finished Stylist sessions (accepted, or abandoned after 24 hours) and saves up to 3 facts per session as style notes with `source: 'learned'`. They show up in `GET /api/style-notes` like any other note. Repeats of an existing note are skipped.
- Notes are capped at 50. When a new note (the user's or a learned one) would go over, the oldest learned notes are deleted; the user's own notes never are. `POST /api/style-notes` is a 400 only when all 50 are the user's.

## Not implemented
- New garment types (romper, etc.)

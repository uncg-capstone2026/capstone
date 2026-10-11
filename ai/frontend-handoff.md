# Frontend handoff: outfit conversations, weather and try-on

**From:** Javier (AI / server). **For:** whoever owns `client/`.

> **Breaking:** "Looks right" returns **400** until the app sends `sessionId` and `turnId` (section 4).

API reference: `server/CLAUDE.md`. Design: `ai/repromptimplementation.md`.

## 1. Outfit suggestions are now a conversation
- **Before:** every "Try another" started over from scratch, and "Not for me" saved the comment somewhere nothing read it.
- **Now:** the first request starts a **session**. Every outfit after that is a **turn** in it. The AI remembers what it already showed and what the user said.

## 2. First outfit
`POST /api/stylist/outfit`

**Send:**
```json
{ "occasion": "class", "date": "2026-10-11", "lat": 36.07, "lon": -79.79 }
```
- `lat`/`lon` are optional. Stop sending `excludeSuggestionIds`.

**Weather:**
- With `lat`/`lon`, the server fetches that day's forecast once and uses it for the whole session. For example: a coat when it's cold, no shorts, rain-friendly shoes.
- If they're missing, or the weather can't be fetched (location denied, more than 7 days out, weather service down), there's **no error**. The outfit is just picked without weather.
- Only the first request sends the location. Reprompts reuse the forecast saved on the session.

**Receive:**
```jsonc
{
  "sessionId": "...",   // NEW: same for every outfit in this conversation. Keep it.
  "turnId": "...",      // NEW: this outfit. Changes every time. Keep it.
  "suggestionId": "...",
  "name": "Easy layers for class",
  "reasons": ["..."],
  "items": [{ "id": "...", "name": "...", "category": "tops", "type": "t-shirt", "imageUrl": "..." }]
}
```

## 3. "Not for me" / "Try another"
`POST /api/stylist/outfit/reprompt`

**Send:**
```json
{ "sessionId": "...", "message": "different shoes" }
```
- `message` is optional, up to 300 characters.

**Receive:** the same shape as section 2, with a new `turnId`.

**What happens:**
- **No message** (or `""`): plain "Try another". Often instant.
- **With a message:** the AI adjusts the outfit:
  - "different shoes" swaps only the shoes.
  - "add a jacket" or "more formal" changes the outfit to match.
  - "actually it's for a wedding" starts over.
- The screen goes **straight to the next outfit**. There's no "rejected" result card anymore.
- Stop calling `/outfit/feedback`.
- The sheet's text promises answers are saved to Style Preferences, which isn't true anymore. Suggested copy:
  - subtitle: "StyleMe uses your answer to pick the next outfit."
  - button: "Show me another"

## 4. "Looks right" (breaking)
`POST /api/stylist/outfit/accept`

**Send:** the same body as today, plus `sessionId` and `turnId` from the outfit being accepted:
```json
{ "sessionId": "...", "turnId": "...", "suggestionId": "...", "itemIds": ["..."], "name": "...", "eventName": "...", "date": "2026-10-11" }
```

**Receive:** `{ "outfitId": "..." }` (unchanged).

- This saves the outfit and the calendar entry, and **closes the session**.
- "Try another suggestion" on the accepted result card must call `/outfit` again to start a **new** session. Reprompting a closed session returns 409.

## 5. Try-on (new)
`POST /api/stylist/try-on`

**Send:** `{ "itemIds": ["..."] }`, the pieces on screen, 1–8 of them.

**Receive:** `{ "imageUrl": "..." }`, a photo of the user wearing them.
- It takes 10–30 seconds.
- The link works for 24 hours.

Full details: `ai/try-on-handoff.md`.

## 6. Errors
| Status | Meaning | Show |
|---|---|---|
| 400 | Bad body (message too long, missing `sessionId`/`turnId` on accept) | generic retry |
| 404 | Session not found, item not in closet, or no try-on photo yet | `serverMessage` |
| 409 | Session already finished, another reprompt still running, or accepting an outfit that isn't the latest | `serverMessage` |
| 422 | Nothing new left, not enough items, 20-outfit limit, or the try-on photo couldn't be used | `serverMessage` |
| 503 | AI unavailable | `serverMessage`, with retry |

`stylistError` only shows `serverMessage` for 422 and 503 today. **Add 404 and 409.** Those messages are written for users.

## 7. What to change in the app

### `client/src/services/stylist.ts`
- `OutfitSuggestion`: add `sessionId: string` and `turnId: string`.
- `OutfitRequest`: remove `excludeSuggestionIds` and add `lat?: number; lon?: number`. `styleOutfit` sends `{ date, occasion, lat, lon }`.
- `AcceptOutfitRequest`: add `sessionId` and `turnId`. `acceptOutfit` already spreads the request.
- Remove `rejectOutfit` and `RejectOutfitRequest`.
- Add:
  ```ts
  export async function repromptOutfit(request: { sessionId: string; message?: string }): Promise<OutfitSuggestion> {
    try {
      return await apiPost<OutfitSuggestion>('/api/stylist/outfit/reprompt', request);
    } catch (e) {
      throw stylistError(e, 'StyleMe could not put an outfit together. Please try again.');
    }
  }
  ```
- Fixture mode:
  - `fixtureSuggestion` returns `sessionId: 'fixture'` and a `turnId`.
  - `repromptOutfit` returns the next round using a module-level counter.

### `client/src/hooks/use-weather.ts`
Also return `coords: { lat, lon } | null` from the position it already reads. It stays `null` when there's no location.

### `client/src/app/suggestion.tsx`
- Replace `excludeIds` with the next request to make:
  ```ts
  type NextRequest = { kind: 'start' } | { kind: 'reprompt'; sessionId: string; message?: string };
  ```
  - `start`: wait for `useWeather` to finish loading, then call `styleOutfit` with `coords` if there are any.
  - `reprompt`: call `repromptOutfit`.
  - Retry repeats the same request.
  - Use a counter in place of `excludeIds.length` for the `StylingLoader` key.
- Pull the resets in `tryAnother` into a `resetForNext()`.
- "Not for me":
  ```ts
  function reject(feedback: string) {
    if (!suggestion) return;
    setSheet(null);
    resetForNext();
    setRequest({ kind: 'reprompt', sessionId: suggestion.sessionId, message: feedback });
  }
  ```
- "Looks right": pass `suggestion.sessionId` and `suggestion.turnId` to `acceptOutfit`.
- "Try another suggestion" after accepting: `setRequest({ kind: 'start' })`.
- `openResult` only needs the accepted branch.

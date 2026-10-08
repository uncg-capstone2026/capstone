# Frontend handoff: Stylist sessions, reprompting and weather

**From:** Javier (AI / server). **For:** whoever owns `client/`.

The Stylist now remembers a conversation. The first request starts a **session**, and every outfit shown after it is a **turn**. The user can react to an outfit and get a better next one.
- Design: `ai/repromptimplementation.md`
- API: `server/CLAUDE.md`

**Each response is still one outfit** (name, 2–4 reasons, items), in the same shape as today, plus two ids. The extra outfits the AI picks stay queued on the server.

Files:
- `client/src/services/stylist.ts`
- `client/src/app/suggestion.tsx`
- `client/src/hooks/use-weather.ts`

## 1. Keep `sessionId` and `turnId`
`POST /api/stylist/outfit` now returns two more fields:
```ts
export type OutfitSuggestion = {
  sessionId: string; // the conversation; send it with every reprompt
  turnId: string;    // this outfit; changes on every response
  suggestionId: string;
  name: string;
  reasons: string[];
  items: SuggestedPiece[];
};
```
Reprompts return the same shape, with the **same** `sessionId` and a **new** `turnId`. Keep the latest response in state, as `suggestion` already does.

## 2. Send the location with the first request
**Why:** the stylist uses the forecast for the outfit's day.
- The query expansion picks the right kinds of clothes: a coat and boots when it's cold, no shorts, rain-friendly shoes.
- The outfit picker uses it for outerwear and layers.

The server fetches the forecast itself, with the same `WeatherService` as `GET /api/weather` (cached for 10 minutes). It only needs coordinates, which the request doesn't send yet.

**What to change:** add optional `lat` and `lon` to `OutfitRequest` and send them in `styleOutfit`'s body:
```ts
export type OutfitRequest = {
  date: Date;
  occasion: string;
  lat?: number;
  lon?: number;
};

return await apiPost<OutfitSuggestion>('/api/stylist/outfit', {
  date: toDateKey(request.date),
  occasion: request.occasion,
  lat: request.lat,
  lon: request.lon,
});
```

**Where to get the coordinates:** `suggestion.tsx` already calls `useWeather(date)`, and `use-weather.ts` already reads the position (`getPosition()` → `position.coords.latitude/longitude`). Either:
- expose `lat`/`lon` from `useWeather` and pass them to `styleOutfit(...)`, or
- call `getPosition()` (after the permission check) right before `styleOutfit`.

Wait for the coordinates, or for location to be denied, before sending the first request.

**Behavior:**
- **The forecast is saved on the session**, and every reprompt reuses it. Only the first request sends `lat`/`lon`, and if that one has no location, the whole session runs without weather.
- Both fields are optional. If location is denied or unavailable, leave them out, and the outfit is picked without weather.
- Weather problems never cause an error: no API key, a date past the 7-day forecast, or WeatherAPI being down. The server just skips the weather.

## 3. Add `repromptOutfit`
```ts
// POST /api/stylist/outfit/reprompt -> the next outfit in the same session.
export async function repromptOutfit(request: { sessionId: string; message?: string }): Promise<OutfitSuggestion> {
  try {
    return await apiPost<OutfitSuggestion>('/api/stylist/outfit/reprompt', request);
  } catch (e) {
    throw stylistError(e, 'StyleMe could not put an outfit together. Please try again.');
  }
}
```
- Leave out `message` (or send `''`) for "Try another".
- `message` is at most 300 characters. Anything longer returns 400.

## 4. "Try another suggestion"
Today `tryAnother()` adds the `suggestionId` to `excludeIds`, which runs `styleOutfit` again with `excludeSuggestionIds`. Instead, call:
```ts
repromptOutfit({ sessionId: suggestion.sessionId })
```
- This is often instant, because it's served from the queue with no AI call.
- Stop sending `excludeSuggestionIds` and drop `excludeIds`. The server still accepts the field so the current app keeps working, but it will be removed.
- Only the **first** load should call `styleOutfit`. Every later outfit comes from `repromptOutfit`.

## 5. "Not for me"
Today `reject(feedback)` calls `rejectOutfit` and shows the "rejected" result. Keep that call: Taylor's `/outfit/feedback` stays for now. Then also get the next outfit from the feedback:
```ts
await rejectOutfit({ suggestionId: suggestion.suggestionId, itemIds, feedback });
const next = await repromptOutfit({ sessionId: suggestion.sessionId, message: feedback });
```
Show `next` like any other outfit, with the same loader. The server works out what to change:
- "different shoes" keeps the rest and swaps the shoes.
- "add a jacket" or "more formal" changes the outfit to match.
- "actually it's for a wedding" starts over.

An empty `feedback` behaves like "Try another". Whether the "rejected" result screen still shows up is a design call.

## 6. "Looks right": no change yet
**Don't add `sessionId` or `turnId` to the accept body yet.** The accept route rejects unknown fields with **400**.

Once the backend handoff (`ai/backend-handoff.md`) is done, add them:
```ts
{ sessionId, turnId, suggestionId, itemIds, name, eventName, date }
```
Accepting will then also close the session.

## 7. Errors
| Status | Meaning | Show |
|---|---|---|
| 400 | Bad body (e.g. message over 300 chars) | generic retry |
| 404 | Session not found or not this user's | start over from the Stylist tab |
| 409 | Session finished, or another reprompt still running | ignore the double tap, or start over |
| 422 | Nothing new left, not enough items, or 20 outfits in one session | `serverMessage` |
| 503 | AI unavailable | `serverMessage`, with retry |

`stylistError` already shows `serverMessage` for 422 and 503.

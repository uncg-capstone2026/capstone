# Frontend handoff: Try-on

**From:** Javier (AI / server). **For:** whoever owns `client/`.

"See it on your photo" and "Try on" can now show the user wearing the outfit. The server takes the outfit's item IDs, generates a photo of the user in those clothes from their try-on photo, and returns a link to it.
- API: `server/CLAUDE.md` ("Try-on")

Files:
- `client/src/services/stylist.ts`
- `client/src/app/try-on.tsx` (currently a "coming soon" placeholder)
- `client/src/app/suggestion.tsx` (button at ~line 192)
- `client/src/app/outfit/[id].tsx` (button at ~line 315)

## 1. Add `tryOn` to the stylist service
`POST /api/stylist/try-on` `{ itemIds }` → `{ imageUrl }`. Same pattern as `styleOutfit`:
```ts
export type TryOnResult = { imageUrl: string };

export async function tryOn(itemIds: string[]): Promise<TryOnResult> {
  try {
    return await apiPost<TryOnResult>('/api/stylist/try-on', { itemIds });
  } catch (e) {
    throw stylistError(e, "StyleMe couldn't create your try-on. Please try again.");
  }
}
```

## 2. Pass the item IDs from both buttons
**Send the pieces that are on screen**, not the saved outfit. On `outfit/[id]` the user can add and remove pieces, so the saved version can be out of date.
- `suggestion.tsx`: `suggestion.items` (there's already an `itemIds` at ~line 107).
- `outfit/[id].tsx`: `pieces` (`outfit.items`) at ~line 121.

Route params are strings, so join them:
```ts
router.push({ pathname: '/try-on', params: { itemIds: itemIds.join(',') } });
```
In `try-on.tsx`, read them with `useLocalSearchParams<{ itemIds: string }>()` and `split(',')`.

## 3. `try-on.tsx`
Call `tryOn(itemIds)` when the screen opens.
- **Loading:** it takes about **10–30 seconds**, longer than a stylist request. A loader like `StylingLoader`, with a line such as "Dressing you up…", fits.
- **Success:** show `imageUrl` in an `<Image>`. It's a JPEG at roughly the same proportions as their try-on photo, so `contentFit="contain"` keeps it uncropped.
- **No try-on photo yet:** a **404** whose message is "You haven't uploaded a try-on photo yet." Show it with a button to `/(onboarding)/body-photo`.
- **Other errors:** show `serverMessage`.
  - 404 "Some of these items are no longer in your closet."
  - 422: the photo couldn't be used, e.g. "The photo doesn't clearly show one person." This text comes from the AI, so show it as-is with a way to retake the photo.
  - 503: AI unavailable. Offer "Try again".

Two different 404s mean different things, so check the message (or call `GET /api/photos/body` first and skip the try-on call if that 404s).

## 4. Don't keep the link
The image isn't saved anywhere the app can get back to. The URL works for 24 hours, and the file is deleted a few days later. If the user leaves and comes back, generate a new one. Each call costs an AI request, so don't regenerate on every re-render. Call once per visit to the screen.

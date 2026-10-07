# Connecting the client to the server

The Expo app (`client/`) and the NestJS server (`server/`) can't talk to each other yet. This file lists everything needed to connect them, in the order to do it. Completed items are moved to `DONE.md`, which is git-ignored and only on the machine that moved them.

## 1. Basic server setup (blocks everything else)

All done.

## 2. Auth (needed before any real data)

### Server
- [ ] Later: Google sign-in, which needs server-side token verification. (Sign in with Apple was removed from the app.)

### Client

All done.

## 3. Body photo upload

The client and server currently disagree on almost every detail:

| | App calls | Server has |
|---|---|---|
| Get an upload URL | `POST /api/photos/body/upload-url` `{ contentType, fileName }` → `{ uploadUrl, key }` | `POST /uploads/body-photo` `{ userId, contentType }` → `{ key, url }` |
| Save it to the user | `POST /api/photos/body` `{ key }` | **missing** |

- [ ] S3: the bucket's CORS settings must allow `PUT` from the app, or web uploads fail.

## 4. Closet items

Clothing photos live in AWS S3. The client uploads the original photo, and the server cuts the piece out and stores the cutout in S3 as well (`Item.imageKey` for the original, `Item.cutoutKey` for the cutout).

- [ ] Adding items from a link (the client calls `importItemFromLink`, currently a "coming soon" stub): a route that fetches the product page, saves the product image to S3 and returns details for the user to confirm.
- [ ] Client: once `importItemFromLink` returns an item id, open the confirm screen (`src/app/confirm-item/[id].tsx`) for it, as adding from a photo does.
- [ ] If the app is closed on the confirm screen, the item stays in the closet unchecked (and untagged until tagging is wired in). Later, an `isConfirmed` flag on `Item` (hidden from `GET /api/items` until Save) would stop that.

### Item details screen

Tapping an item in the closet opens `src/app/item/[id].tsx`. The screen is built. The server now sends everything it shows: wear stats, "Saved in outfits", the exclude toggle, the Fitted and Loose fit steps and the color dropper.

- [ ] Client: an outfit details screen. Outfit chips, outfit tiles and "Open the outfit" all open `src/app/outfit/[id].tsx`, which is a "coming soon" placeholder for now. It can be built now against `GET /api/outfits/:id` (`SavedOutfit` in `src/services/outfits.ts`, section 9).
- [ ] Client: show the remaining AI tags on the item details screen in a collapsed section (e.g. "More details" with a chevron that opens and closes it) so they don't clutter the screen:
  - `type` (move the existing Type dropdown in here), `material`, `season` and `formality`. `ClothingItemDetails` already has them all. Cut, colors, fit and category stay where they are, and `pattern` stays under the colors in `ColorSection`.
  - Show the values with `formatTag`, and let the user edit them like the other tags.
  - Label each one "Filled in by StyleMe", the same `aiHint` the confirm screen uses (`AI_HINT` in `src/app/confirm-item/[id].tsx`; move it somewhere shared, e.g. `src/services/items.ts`, rather than copying it). Like the confirm screen, show it only when the field has a value. This replaces Type's current hint ("AI tag · the stylist uses this to pick outfits"). The server doesn't record whether the user changed a tag since, so the label shows on edited values too; hiding it for those would need a new field on `Item`.

- [ ] Seed a few tagged items for the test account. Items added from a photo have no tags yet, so the closet filters and details screen need seeded data to test against.

### Wear tracking and excluding items from suggestions

- Skipping excluded items in outfit suggestions is in section 8.

### Cutout and tagging (server side)

The background is removed on the **server**, not the phone. That gives the same result on iOS, Android and web, works in Expo Go, and can be changed without an app update. The server already has to look at the photo to fill in category, color and fit, and that AI key must stay server-side anyway.

All of `POST /api/items/photo { key }` is built: ownership check, download and resize, cutout with Stability AI (`server/src/items/cutout.service.ts`), saving `<uuid>-cutout.png`, then Gemini tagging and embedding in parallel. If a step fails, the item is still saved without that part. The remaining tagging and embedding tasks are in section 8.

How it runs:
- [ ] **Later, if it's slow:** reply straight away with the item saved using only `imageKey`, and do steps 3–6 in the background, e.g. with an S3-triggered Lambda or a job queue. The `imageUrl` fallback (cutout if ready, otherwise the original) already handles the gap.

Possible later extra: on-device cutout on iOS 17+ (Apple's Vision framework) for an instant preview while the server makes the final version. It needs a custom native module and doesn't work in Expo Go.

## 5. Client cleanups

All done.

## 6. Weather (WeatherAPI.com)

Outfit suggestions should take the weather into account. Weather data comes from [WeatherAPI.com](https://www.weatherapi.com). It uses a plain API key (no JWT like Apple WeatherKit), doesn't need an Apple Developer membership, and works on iOS and Android. The app never calls WeatherAPI.com directly. It calls our server, and the server calls WeatherAPI.com, so the key never ships in the app bundle.

### Server
- [ ] Later: fill `CalendarEntry.weatherSummary` and `tempHigh` when an outfit is planned for a date (the forecast endpoint takes `days` up to the plan's limit).

### Client

All done.

## 7. Stylist ("Plan an outfit")

The Stylist tab (`src/app/(tabs)/stylist.tsx`) is the start of the AI chat. The user picks any upcoming day (defaulting to today), sees that day's weather, types where they're headed, and taps "Style my outfit →".

### Client
The suggestion screen (`src/app/suggestion.tsx`) is built. "Style my outfit" opens it, and it shows one outfit at a time as a flat-lay, with "Not for me" and "Looks right". It calls the live `POST /api/stylist/outfit` (`USE_OUTFIT_FIXTURE` is off). "Looks right" calls `POST /api/stylist/outfit/accept`, which saves the outfit with a calendar entry for the day, and "Not for me" sends the answer to `POST /api/stylist/outfit/feedback` (`USE_ACCEPT_FEEDBACK_FIXTURE` is off).

- [ ] The try-on screen (`src/app/try-on.tsx`, "See it on your photo") and Style Preferences (`src/app/style-preferences.tsx`, "See what was remembered") are "coming soon" placeholders.
- [ ] "Open the outfit" goes to `src/app/outfit/[id].tsx`, which is still a placeholder (see "Item details screen" in section 4).

### Server
`POST /api/stylist/outfit { occasion, date? }` (`server/src/stylist/`) is built: `QueryExpansionService` expands and embeds the request, `OutfitPlanningService.findCandidates` finds the closest closet items with pgvector, and `selectOutfit` has Gemini pick one complete outfit. It returns the shape agreed with the app (`OutfitSuggestion` in `src/services/stylist.ts`): `{ suggestionId, name, reasons, items: { id, name, category, type, imageUrl }[] }`, taking `{ date, occasion, excludeSuggestionIds }`, or 422 when the closet can't make a complete outfit.

The Gemini work on the outfit route itself (weather, search, errors, prompts) is in section 8. The accept and feedback routes are done.

## 8. AI (Gemini)

Everything that touches Gemini, the embeddings or the pgvector search: setup, item tagging, and the outfit suggestion route. The code is in `server/src/gemini/` and `server/src/stylist/`.

### Setup and security
- [ ] Add `GEMINI_API_KEY` to `server/.env` and the Railway variables (`server/.env.example` has it). Without it, every Gemini call fails.
- [ ] Security: `GeminiController` (`/api/gemini/*`) has no auth guard, so anyone can use up the Gemini quota. Remove the three "DELETE LATER" test routes (`expand-and-embed`, `embed-image`, `image-attributes`) and `expand-query` before release, or put them behind `AuthGuard` until then.
- [ ] Database: the init migration creates an `embedding vector(768)` column but never runs `CREATE EXTENSION vector`. Check pgvector is enabled on Railway, and add a migration with `CREATE EXTENSION IF NOT EXISTS vector` so a fresh database works.
- [ ] `server/src/main.ts` now loads `.env` with `dotenv/config` as well as `ConfigModule`. Keep one. `GeminiHelpers` reads `process.env.GEMINI_API_KEY` directly, so whichever stays must load before it.

### Item tagging and embeddings (section 4)
- [ ] `FITS` in `server/src/gemini/constants.ts` still uses `Relaxed` and has no `Fitted`, so the AI never tags an item Fitted. Change it to `['Fitted', 'Slim', 'Regular', 'Loose', 'Oversized']` to match the `Fit` enum. (`item-mappings.ts` already maps `Relaxed` to `Loose`, so nothing breaks in the meantime.)
- [ ] `PATCH /api/items/:id` accepts any `type` up to 50 characters, but the Stylist search matches `type` exactly against `CLOTHING_TYPES` in `server/src/gemini/constants.ts`. Validate `type` against that list, and make the list available to the app (send it, or add `GET /api/items/types`).
- [ ] Backfill `type` and `embedding` for items added before tagging and embedding were wired in, since the Stylist search skips items without them.
- [ ] Gemini only accepts PNG and JPEG (`EMBEDDABLE_IMAGE_TYPES`), but the upload routes also accept WebP. When there's no cutout, a WebP original is currently skipped (no tags or embedding). Convert it to JPEG with sharp instead.
- [ ] Add `cut` to AI tagging. `extractImageAttributes` fills every other tag but not `cut`, so it's always empty until the user picks one. Add it to the image-attributes schema, prompt and result type (`server/src/gemini/image-processing/`), and save it in `ItemsService.createFromPhoto` with the other tags. Pick from the cuts the app offers for the item's category (`COMMON_CUTS` in `client/src/services/items.ts`; copy the list into `server/src/gemini/constants.ts`, since the server can't import from the client), or `null` if it can't tell or the category has no cuts. The confirm screen already shows `cut` and marks AI-filled fields, so the app needs no change.

### Outfit suggestions (`POST /api/stylist/outfit`, section 7)
- [ ] Pass the day's weather (from `WeatherService`, with `date`) into the query expansion and outfit prompts. Neither gets the weather yet, though both rely on it.
- [ ] `findCandidates` ignores the `season`, `formality`, `preferred_colors` and `exclude_colors` the query expansion returns. Decide whether to filter or rank by them.
- [ ] Make "Exclude from future outfit suggestions" work on the backend. `findClosestItems` in `server/src/gemini/outfit-planning/service.ts` is where all Stylist candidates come from, and it now skips items with `excludeFromSuggestions = true` (fixed on `eesladden`, not merged yet). Still to do: merge it, check the two Oct 7 migrations have run on Railway (`build` and `start` don't run `prisma migrate deploy`), then test it: exclude an item, ask the Stylist for an outfit it would suit, and check it's never suggested. (See "Wear tracking" in section 4.)
- [ ] Return Gemini failures as 503 `{ message }`, like weather. Right now they surface as raw errors (the 422 for "not enough items" can stay).
- [ ] Use the Style Preferences saved by the feedback route (section 7) in the outfit prompt, so suggestions learn from what the user turned down.

### Prompts
- [ ] `ai/Prompts.md` has older drafts that differ from the prompts in `server/src/gemini/*/prompt.ts`. Update or delete it so there's one source.
- [ ] Later: the memory prompt noted at the end of `ai/Prompts.md` ("extract/attach memories relevant to the original user prompt").

## 9. Outfits and collections

The Outfits tab (`src/app/(tabs)/outfits.tsx`) is built: the "All saved outfits" card, the Favorites row, and a grid of collections the user can create, rename and delete. They use the live outfit and collection routes (`USE_COLLECTIONS_FIXTURE` is off).

Tapping a card opens the collection screen (`src/app/collection/[id].tsx`, where `id` is `all`, `favorites` or a collection id): the title, the outfit count and a grid of outfits, each opening `src/app/outfit/[id].tsx`. In edit mode, a user collection can be renamed and have outfits added ("Add from all saved outfits") or removed. Favorites can have outfits added (favorited) or removed (unfavorited). All saved outfits can only delete outfits, after a confirmation.

### Server
- [ ] Later: let the user say they didn't wear a planned outfit (e.g. "Didn't wear it" on a past calendar day). That would undo the counts for that entry, rolling `lastWorn` back to the outfit's previous worn entry.

### Client
- [ ] Add `timesWorn`, `lastWorn` and `createdAt` to `SavedOutfit` once the server sends them, and show them on the outfit details screen.

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3) (server done; S3 CORS still to check)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (done)
6. Cutout and tagging (section 4) (done; backfilling older items, WebP conversion and `FITS` are in section 8)
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): the screen and the outfit route are built, with the agreed response shape. The accept and feedback routes are done and the app uses them. Next is passing in the weather (section 8)
9. Outfits and collections (section 9): the client screens are built and use the live routes. The schema, `OutfitsService.create` and the outfit and collection routes are done on the server. So are `PATCH /api/auth/me { timeZone }` and the hourly wear tracking job. The app sends the device's time zone. Next is the outfit details screen

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Build the outfit details screen (`src/app/outfit/[id].tsx`) against `GET /api/outfits/:id` (section 4, "Item details screen").
- [ ] Move Type and add `material`, `season` and `formality` to a collapsed "More details" section on the item details screen, each labelled "Filled in by StyleMe" (section 4, "Item details screen").
- [ ] Test the Outfits tab and the collection screen on a device: accept a Stylist suggestion, then create a collection, add and remove outfits, rename it, favorite and unfavorite, and delete an outfit (section 9).

### Needs a server decision first
- [ ] The link-import route (section 4), so `importItemFromLink` can go live.

# Connecting the client to the server

The Expo app (`client/`) and the NestJS server (`server/`) can't talk to each other yet. This file lists everything needed to connect them, in the order to do it. Completed items are moved to `DONE.md`, which is git-ignored and only on the machine that moved them.

## 1. Basic server setup (blocks everything else)

All done.

## 2. Auth (needed before any real data)

### Server
- [ ] Later: Apple and Google sign-in, which each need server-side token verification.

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

- [ ] Server: `getDownloadUrl` signs for 5 minutes, which will break the app's cached images. Use a longer expiry or a CloudFront URL.
- [ ] Client: Test the upload end to end against Railway.
- [ ] Adding items from a link (the client calls `importItemFromLink`, currently a "coming soon" stub): a route that fetches the product page, saves the product image to S3 and returns details for the user to confirm.
- [ ] Client: once `importItemFromLink` returns an item id, open the confirm screen (`src/app/confirm-item/[id].tsx`) for it, as adding from a photo does.
- [ ] If the app is closed on the confirm screen, the item stays in the closet unchecked (and untagged until tagging is wired in). Later, an `isConfirmed` flag on `Item` (hidden from `GET /api/items` until Save) would stop that.

### Item details screen

Tapping an item in the closet opens `src/app/item/[id].tsx`. The screen is built. These parts are waiting on the server and show a placeholder or are disabled until it sends the data: wear stats, "Saved in outfits", the exclude toggle, the Fitted and Loose fit steps, and the color dropper.

- [ ] Server: change the `Fit` enum to **Fitted, Slim, Regular, Loose, Oversized**: add `Fitted` before `Slim` and rename `Relaxed` to `Loose`, with a migration (`ALTER TYPE "Fit" ADD VALUE 'Fitted' BEFORE 'Slim'` and `ALTER TYPE "Fit" RENAME VALUE 'Relaxed' TO 'Loose'`). Update `FIT_TO_CLIENT` in `server/src/items/item-mappings.ts` (`fitted`, `loose`). Until then, the app shows "relaxed" as Loose, and picking Fitted or Loose shows the server's 400 error.
- [ ] Server: add `outfits: { id, name }[]` to the `GET /api/items/:id` response: the signed-in user's outfits that include the item (through `OutfitItem`), each listed once.
- [ ] Server: build `GET /api/items/:id/color-grid` for the color dropper → `{ width, height, pixels }`. Use sharp to shrink the cutout (or the original if there's no cutout) to about 64 px on the longest side, keeping its aspect ratio. `pixels` is row-major, `width * height` long, each `"#RRGGBB"`, or `null` where alpha is below 50%. Same ownership check as the other `:id` routes (404). The app loads it once when the dropper is turned on and reads colors from it locally.
- [ ] Client: an outfit details screen. Outfit chips open `src/app/outfit/[id].tsx`, which is a "coming soon" placeholder for now.
- [ ] Server: `PATCH /api/items/:id` accepts any `type` up to 50 characters, but the Stylist search matches `type` exactly against `CLOTHING_TYPES` in `server/src/gemini/constants.ts`. Validate `type` against that list, and make the list available to the app (send it, or add `GET /api/items/types`).

- [ ] Seed a few tagged items for the test account. Items added from a photo have no tags yet, so the closet filters and details screen need seeded data to test against.

### Wear tracking and excluding items from suggestions

- [ ] Server: schema additions to `Item`, with a migration:
  - `timesWorn Int @default(0)`: how many times the item has been worn in total.
  - `timesWornThisMonth`: how many times it has been worn this month. Decide how to store it first.
  - `excludeFromSuggestions Boolean @default(false)`: when `true`, the item is never used in outfit suggestions. The user can turn it on and off.
- [ ] Server: add the new fields to the `GET /api/items/:id` response (the app reads `timesWorn`, `timesWornThisMonth` and `excludeFromSuggestions`), and accept `excludeFromSuggestions` in `PATCH /api/items/:id` (`UpdateItemDto`, as a boolean that can't be `null`).
- [ ] Server: decide what increases `timesWorn`, e.g. marking a planned calendar outfit as worn, or a "Wore it today" button on the details screen. If it's a button, add a route for it (e.g. `POST /api/items/:id/worn`).
- [ ] Server: the Stylist outfit route (section 7) must skip items with `excludeFromSuggestions: true`.

### Cutout and tagging (server side)

The background is removed on the **server**, not the phone. That gives the same result on iOS, Android and web, works in Expo Go, and can be changed without an app update. The server already has to look at the photo to fill in category, color and fit, and that AI key must stay server-side anyway.

All of `POST /api/items/photo { key }` is built: ownership check, download and resize, cutout with Stability AI (`server/src/items/cutout.service.ts`), saving `<uuid>-cutout.png`, then Gemini tagging and embedding in parallel. If a step fails, the item is still saved without that part.

- [ ] Server: backfill `type` and `embedding` for items added before tagging and embedding were wired in, since the Stylist search skips items without them.
- [ ] Server: Gemini only accepts PNG and JPEG (`EMBEDDABLE_IMAGE_TYPES`), but the upload routes also accept WebP. When there's no cutout, a WebP original is currently skipped (no tags or embedding). Convert it to JPEG with sharp instead.
- [ ] Server: `FITS` in `server/src/gemini/constants.ts` uses `Relaxed` and has no `Fitted`. Update it together with the Fit enum change (item details screen, above).

How it runs:
- [ ] **Later, if it's slow:** reply straight away with the item saved using only `imageKey`, and do steps 3–6 in the background, e.g. with an S3-triggered Lambda or a job queue. The `imageUrl` fallback (cutout if ready, otherwise the original) already handles the gap.

Possible later extra: on-device cutout on iOS 17+ (Apple's Vision framework) for an instant preview while the server makes the final version. It needs a custom native module and doesn't work in Expo Go.

## 5. Client cleanups

All done.

## 6. Weather (WeatherAPI.com)

Outfit suggestions should take the weather into account. Weather data comes from [WeatherAPI.com](https://www.weatherapi.com). It uses a plain API key (no JWT like Apple WeatherKit), doesn't need an Apple Developer membership, and works on iOS and Android. The app never calls WeatherAPI.com directly. It calls our server, and the server calls WeatherAPI.com, so the key never ships in the app bundle.

### Server
- [ ] Sign up for a WeatherAPI.com key and add `WEATHERAPI_KEY` to `server/.env` and the Railway variables. (`server/.env.example` has it.) Without it, every weather request fails.
- [ ] Later: fill `CalendarEntry.weatherSummary` and `tempHigh` when an outfit is planned for a date (the forecast endpoint takes `days` up to the plan's limit).

### Client
- [ ] Location needs a development build or Expo Go on a real device. Test the denied-permission path too.

## 7. Stylist ("Plan an outfit")

The Stylist tab (`src/app/(tabs)/stylist.tsx`) is the start of the AI chat. The user picks any upcoming day (defaulting to today), sees that day's weather, types where they're headed, and taps "Style my outfit →".

### Client
The suggestion screen (`src/app/suggestion.tsx`) is built. "Style my outfit" opens it, and it shows one outfit at a time as a flat-lay, with "Not for me" and "Looks right". Until the routes below exist, `USE_STYLIST_FIXTURE` in `src/services/stylist.ts` builds the outfit from the user's own closet (the first top and bottoms, or a one-piece, plus shoes and an accessory), and accepting or rejecting does nothing.

- [ ] Switch `USE_STYLIST_FIXTURE` off once the three routes below are live.
- [ ] The try-on screen (`src/app/try-on.tsx`, "See it on your photo") and Style Preferences (`src/app/style-preferences.tsx`, "See what was remembered") are "coming soon" placeholders.
- [ ] "Open the outfit" goes to `src/app/outfit/[id].tsx`, which is still a placeholder (section 4).

### Server
`POST /api/stylist/outfit { occasion, date? }` (`server/src/stylist/`) is built: `QueryExpansionService` expands and embeds the request, `OutfitPlanningService.findCandidates` finds the closest closet items with pgvector, and `selectOutfit` has Gemini pick one complete outfit. It currently returns `{ items: [{ itemId, type, imageUrl }], reason }`, or 422 when the closet can't make a complete outfit. The items below bring it in line with what the app expects.

- [ ] Pass the day's weather (from `WeatherService`, with `date`) into the query expansion and outfit prompts. Neither gets the weather yet, though both rely on it.
- [ ] `findCandidates` ignores the `season`, `formality`, `preferred_colors` and `exclude_colors` the query expansion returns. Decide whether to filter or rank by them.
- [ ] `findClosestItems` must skip items with `excludeFromSuggestions` once that column exists (its comment notes this; see "Wear tracking" in section 4).
- [ ] Return Gemini failures as 503 `{ message }`, like weather. Right now they surface as raw errors (the 422 for "not enough items" can stay).
- [ ] Response shape, agreed with the client (`OutfitSuggestion` in `src/services/stylist.ts`): `POST /api/stylist/outfit { date, occasion, excludeSuggestionIds }` returns **one** outfit, `{ suggestionId, name, reasons, items: { id, name, category, type, imageUrl }[] }`. `category` uses the app's names (as `GET /api/items` does), `imageUrl` is signed like the closet's, and `excludeSuggestionIds` lists outfits already shown, for "Try another suggestion". `suggestionId` only has to identify the suggestion for the accept and feedback routes, since nothing is saved until then.
- [ ] Extend `buildOutfitSelectionSchema` and `OUTFIT_SELECTION_PROMPT` to return a short outfit `name` and 2-4 short `reasons` (weather, occasion, the user's preferences). They return a single `reason` and no name today.
- [ ] `POST /api/stylist/outfit/accept { suggestionId, itemIds, name, eventName, date }` → `{ outfitId }`. It creates the `Outfit` with its `OutfitItem`s and a `CalendarEntry` with `eventName` for `date`, and logs the accept so later suggestions can learn from it. Check every item id belongs to the user. `OutfitSlot` only has `top`, `bottom`, `shoes` and `accessory`, so add `outerwear` and `onepiece` (with a migration).
- [ ] `POST /api/stylist/outfit/feedback { suggestionId, itemIds, feedback }` → 204. It saves the user's answer ("What would you rather wear?") to Style Preferences, which needs a new model, and the outfit prompt should use those preferences.

## 8. AI (Gemini) setup and cleanup

- [ ] Add `GEMINI_API_KEY` to `server/.env` and the Railway variables (`server/.env.example` has it). Without it, every Gemini call fails.
- [ ] Security: `GeminiController` (`/api/gemini/*`) has no auth guard, so anyone can use up the Gemini quota. Remove the three "DELETE LATER" test routes (`expand-and-embed`, `embed-image`, `image-attributes`) and `expand-query` before release, or put them behind `AuthGuard` until then.
- [ ] Database: the init migration creates an `embedding vector(768)` column but never runs `CREATE EXTENSION vector`. Check pgvector is enabled on Railway, and add a migration with `CREATE EXTENSION IF NOT EXISTS vector` so a fresh database works.
- [ ] `server/src/main.ts` now loads `.env` with `dotenv/config` as well as `ConfigModule`. Keep one. `GeminiHelpers` reads `process.env.GEMINI_API_KEY` directly, so whichever stays must load before it.
- [ ] `ai/Prompts.md` has older drafts that differ from the prompts in `server/src/gemini/*/prompt.ts`. Update or delete it so there's one source.
- [ ] Later: the memory prompt noted at the end of `ai/Prompts.md` ("extract/attach memories relevant to the original user prompt").

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3) (server done; S3 CORS still to check)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (server and client done; needs an end-to-end test)
6. Cutout and tagging (section 4) (done; backfilling older items and WebP conversion still to do)
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): the screen and a first version of the outfit route are built. Next is matching the agreed response shape and passing in the weather, then the accept and feedback routes

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Test adding an item end to end against Railway (the server now also makes the cutout during that request). The nullable `category` and the TODO removal are done.
- [ ] Test location and the weather card on a real device with Expo Go or a development build, including the denied-permission path (section 6).

### Needs a server decision first
- [ ] The link-import route (section 4), so `importItemFromLink` can go live.
- [ ] The Stylist routes (section 7), so the suggestion screen can stop using the fixture.
- [ ] Outfit routes (there are none yet), so the outfit details screen can replace the `src/app/outfit/[id].tsx` placeholder.

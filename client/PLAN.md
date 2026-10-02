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
- [ ] Client: remove the "backend routes not built yet" TODO above `uploadItemPhoto`, and test the upload end to end against Railway.
- [ ] Adding items from a link (the client calls `importItemFromLink`, currently a "coming soon" stub): a route that fetches the product page, saves the product image to S3 and returns details for the user to confirm.
- [ ] Client: a "confirm details" screen after adding, where the user checks what StyleMe filled in.

### Item details screen

Tapping an item in the closet opens `src/app/item/[id].tsx`. The screen is built. These parts are waiting on the server and show a placeholder or are disabled until it sends the data: wear stats, "Saved in outfits", the exclude toggle, the Fitted and Loose fit steps, and the color dropper.

- [ ] Server: change the `Fit` enum to **Fitted, Slim, Regular, Loose, Oversized**: add `Fitted` before `Slim` and rename `Relaxed` to `Loose`, with a migration (`ALTER TYPE "Fit" ADD VALUE 'Fitted' BEFORE 'Slim'` and `ALTER TYPE "Fit" RENAME VALUE 'Relaxed' TO 'Loose'`). Update `FIT_TO_CLIENT` in `server/src/items/item-mappings.ts` (`fitted`, `loose`). Until then, the app shows "relaxed" as Loose, and picking Fitted or Loose shows the server's 400 error.
- [ ] Server: add `outfits: { id, name }[]` to the `GET /api/items/:id` response: the signed-in user's outfits that include the item (through `OutfitItem`), each listed once.
- [ ] Server: build `GET /api/items/:id/color-grid` for the color dropper → `{ width, height, pixels }`. Use sharp to shrink the cutout (or the original if there's no cutout) to about 64 px on the longest side, keeping its aspect ratio. `pixels` is row-major, `width * height` long, each `"#RRGGBB"`, or `null` where alpha is below 50%. Same ownership check as the other `:id` routes (404). The app loads it once when the dropper is turned on and reads colors from it locally.
- [ ] Client: an outfit details screen. Outfit chips open `src/app/outfit/[id].tsx`, which is a "coming soon" placeholder for now.
- [ ] Server: `PATCH /api/items/:id` accepts any `type` up to 50 characters, but the Stylist search matches `type` exactly against `CLOTHING_TYPES` in `server/src/gemini/constants.ts`. Validate `type` against that list, and make the list available to the app (send it, or add `GET /api/items/types`).
- [ ] Client: the "confirm details" screen (section 4) can now show the AI-filled name and tags for the user to check. `extractImageAttributes`' comment says "the user reviews them before saving".

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

What happens in step 3 above (`POST /api/items/photo { key }`). Step 1 is built, and the item is already created with just `imageKey` before the cutout. Steps 2–4 (the cutout) are built too. The `// Later:` comment in `ItemsService.createFromPhoto` marks where tagging (steps 5–6) goes.
1. ~~Check the key belongs to the signed-in user (`users/<sub>/clothing/...`) and that the object exists in S3.~~ Done.
2. ~~Download the original from S3. Resize it (e.g. longest side 1024px) to keep processing fast and cheap.~~ Done.
3. **Cut it out.** Done with **Stability AI's Remove Background API** (`STABILITY_API_KEY`, see `server/src/items/cutout.service.ts`). Nova Canvas reached end-of-life on Sept 30, 2026, and Stability on Bedrock kept failing. The original options were:
   - **Amazon Bedrock, Nova Canvas (recommended to start).** It has a background-removal mode. Call it from NestJS with `@aws-sdk/client-bedrock-runtime`, alongside the existing S3 SDK, so there's no model to host. It costs a few cents per image. Check it's available in your AWS region and that model access is enabled on the account.
   - **Self-hosted rembg.** A free, open-source Python library. It needs a small Python service next to the Node server and a machine with enough memory for the model. If you use a Node background-removal library instead, check its licence (some are AGPL).
4. ~~Save the result as a transparent PNG to S3 (e.g. `users/<sub>/clothing/<uuid>-cutout.png`) and set `Item.cutoutKey`. `S3Service.buildKey(userId, 'clothing', 'png')` builds the key, but the `-cutout` suffix pairing it with the original isn't supported yet.~~ Done: saved next to the original as `<uuid>-cutout.png`.
5. **Tag it.** The Gemini service for this is built (`ImageProcessingService.extractImageAttributes` in `server/src/gemini/image-processing/`), but nothing calls it yet.
6. **Embed it.** Also built (`ImageProcessingService.embedImage`), also not called yet. The Stylist search needs it.
7. Update the `Item` with the cutout and tags, then return `{ itemId }`.

- [ ] Server: wire tagging into `ItemsService.createFromPhoto` after the cutout. Call `extractImageAttributes` on the cutout PNG and save `name`, `type`, `category` (it comes from `CATEGORY_BY_TYPE`), `colorHex`, `pattern`, `material`, `season`, `formality` and `fit`. Import `GeminiModule` into `ItemsModule`. If tagging fails, keep the item untagged, like a failed cutout.
- [ ] Server: create and save the item's `embedding` with `embedImage` at the same point. Prisma can't write `vector` columns, so use `$executeRaw` with `'[...]'::vector`. Also backfill `type` and `embedding` for items added before this, since the Stylist search skips items without them.
- [ ] Server: Gemini only accepts PNG and JPEG (`EMBEDDABLE_IMAGE_TYPES`), but the upload routes also accept WebP. Use the cutout PNG, or convert the original to JPEG with sharp when there's no cutout.
- [ ] Server: `FITS` in `server/src/gemini/constants.ts` uses `Relaxed` and has no `Fitted`. Update it together with the Fit enum change (item details screen, above).
- [ ] Server: the `Category` type in `server/src/gemini/constants.ts` is missing `Sets`, and no clothing type maps to it, but the outfit prompt allows "a Sets item". Either add set types or take that line out of the prompt.

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
- [ ] The results view (the chat showing the outfits) once the server route exists. Show up to 3 outfits, each with its items' images (and a reason, if the server adds one), and replace the `styleOutfit` stub in `src/services/stylist.ts`.

### Server
PR #24 added the building blocks in `server/src/gemini/`: `QueryExpansionService` turns the request into garment types plus search text and embeds it, `OutfitPlanningService.findCandidates` finds the closest closet items with pgvector, and `OUTFIT_SELECTION_PROMPT` with `buildOutfitSelectionSchema(ids)` is ready for picking outfits. Nothing connects them yet.

- [ ] Build the outfit route, e.g. `POST /api/stylist/outfit { date: 'YYYY-MM-DD', occasion }`, behind the auth guard and using the signed-in user's id: `expandAndEmbedQuery` → `findCandidates` → a Gemini call with `OUTFIT_SELECTION_PROMPT`, the candidates' details and photos, and `buildOutfitSelectionSchema(ids)`. Nothing is saved ("This chat isn't saved").
- [ ] Write the outfit-selection call. `OutfitPlanningService` only has `findCandidates` so far. Check every returned id is one of the candidates.
- [ ] Pass the day's weather (from `WeatherService`, with `date`) into the query expansion and outfit prompts. Neither gets the weather yet, though both rely on it.
- [ ] `findCandidates` ignores the `season`, `formality`, `preferred_colors` and `exclude_colors` the query expansion returns. Decide whether to filter or rank by them.
- [ ] `findClosestItems` must skip items with `excludeFromSuggestions` once that column exists (its comment notes this; see "Wear tracking" in section 4).
- [ ] Return errors as 503 `{ message }`, like weather, instead of the raw Gemini message the test routes send as a 400.
- [ ] Agree the response shape with the client. The selection schema returns up to 3 outfits, each a list of item ids.

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
6. Cutout and tagging (section 4): background removal done; AI tagging next (the Gemini service is built and needs wiring into adding an item)
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): the screen is built. Next is the outfit route (Gemini query expansion and candidate search are built)

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Test adding an item end to end against Railway (the server now also makes the cutout during that request). The nullable `category` and the TODO removal are done.
- [ ] Test location and the weather card on a real device with Expo Go or a development build, including the denied-permission path (section 6).

### Needs a server decision first
- [ ] The link-import route (section 4), so `importItemFromLink` can go live.
- [ ] The outfit route's response shape (section 7), so the Stylist results view can be built.
- [ ] Wiring AI tagging into adding an item (section 4), so the "confirm details" screen has tags to show.
- [ ] Outfit routes (there are none yet), so the outfit details screen can replace the `src/app/outfit/[id].tsx` placeholder.

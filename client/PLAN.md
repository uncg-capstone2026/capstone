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

- [ ] Server: `getDownloadUrl` signs for 5 minutes, which will break the app's cached images. Use a longer expiry or a CloudFront URL.
- [ ] Client: Test the upload end to end against Railway.
- [ ] Adding items from a link (the client calls `importItemFromLink`, currently a "coming soon" stub): a route that fetches the product page, saves the product image to S3 and returns details for the user to confirm.
- [ ] Client: once `importItemFromLink` returns an item id, open the confirm screen (`src/app/confirm-item/[id].tsx`) for it, as adding from a photo does.
- [ ] If the app is closed on the confirm screen, the item stays in the closet unchecked (and untagged until tagging is wired in). Later, an `isConfirmed` flag on `Item` (hidden from `GET /api/items` until Save) would stop that.

### Item details screen

Tapping an item in the closet opens `src/app/item/[id].tsx`. The screen is built. These parts are waiting on the server and show a placeholder or are disabled until it sends the data: wear stats, "Saved in outfits" and the exclude toggle. The Fitted and Loose fit steps and the color dropper are now live on the server.

- [ ] Server: add `outfits: { id, name }[]` to the `GET /api/items/:id` response: the signed-in user's outfits that include the item (through `OutfitItem`), each listed once.
- [ ] Client: an outfit details screen. Outfit chips, outfit tiles and "Open the outfit" all open `src/app/outfit/[id].tsx`, which is a "coming soon" placeholder for now. It can be built now against the Outfits fixture (`SavedOutfit` in `src/services/outfits.ts`), then switched to `GET /api/outfits/:id` (section 9).

- [ ] Seed a few tagged items for the test account. Items added from a photo have no tags yet, so the closet filters and details screen need seeded data to test against.

### Wear tracking and excluding items from suggestions

- [ ] Server: schema additions to `Item`, with a migration:
  - `timesWorn Int @default(0)`: how many times the item has been worn since it was added. Counting starts at creation, with no backfill.
  - `timesWornThisMonth Int @default(0)`: how many times it has been worn in the current 30-day period.
  - `wearPeriodStart DateTime @default(now())`: when the current 30-day period began. It starts when the item is created, and each period is 30 days from there, so it's per item, not the calendar month.
  - `excludeFromSuggestions Boolean @default(false)`: when `true`, the item is never used in outfit suggestions. The user can turn it on and off.
- [ ] Server: add the new fields to the `GET /api/items/:id` response (the app reads `timesWorn`, `timesWornThisMonth` and `excludeFromSuggestions`), and accept `excludeFromSuggestions` in `PATCH /api/items/:id` (`UpdateItemDto`, as a boolean that can't be `null`). If `wearPeriodStart` is more than 30 days ago when the item is read, send `timesWornThisMonth: 0`, so a missed reset never shows a stale count.
- [ ] Server: items are counted as worn automatically, through their outfits' calendar entries. See "Marking outfits as worn" in section 9.
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
- [ ] Sign up for a WeatherAPI.com key and add `WEATHERAPI_KEY` to `server/.env` and the Railway variables. (`server/.env.example` has it.) Without it, every weather request fails.
- [ ] Later: fill `CalendarEntry.weatherSummary` and `tempHigh` when an outfit is planned for a date (the forecast endpoint takes `days` up to the plan's limit).

### Client
- [ ] Location needs a development build or Expo Go on a real device. Test the denied-permission path too.

## 7. Stylist ("Plan an outfit")

The Stylist tab (`src/app/(tabs)/stylist.tsx`) is the start of the AI chat. The user picks any upcoming day (defaulting to today), sees that day's weather, types where they're headed, and taps "Style my outfit →".

### Client
The suggestion screen (`src/app/suggestion.tsx`) is built. "Style my outfit" opens it, and it shows one outfit at a time as a flat-lay, with "Not for me" and "Looks right". It calls the live `POST /api/stylist/outfit` (`USE_OUTFIT_FIXTURE` is off). The accept and feedback routes aren't built yet, so while `USE_ACCEPT_FEEDBACK_FIXTURE` is on, "Looks right" saves the outfit into the Outfits fixture (section 9) without a calendar entry, and "Not for me" does nothing.

- [ ] Switch `USE_ACCEPT_FEEDBACK_FIXTURE` off once the accept and feedback routes below are live.
- [ ] The try-on screen (`src/app/try-on.tsx`, "See it on your photo") and Style Preferences (`src/app/style-preferences.tsx`, "See what was remembered") are "coming soon" placeholders.
- [ ] "Open the outfit" goes to `src/app/outfit/[id].tsx`, which is still a placeholder (see "Item details screen" in section 4).

### Server
`POST /api/stylist/outfit { occasion, date? }` (`server/src/stylist/`) is built: `QueryExpansionService` expands and embeds the request, `OutfitPlanningService.findCandidates` finds the closest closet items with pgvector, and `selectOutfit` has Gemini pick one complete outfit. It returns the shape agreed with the app (`OutfitSuggestion` in `src/services/stylist.ts`): `{ suggestionId, name, reasons, items: { id, name, category, type, imageUrl }[] }`, taking `{ date, occasion, excludeSuggestionIds }`, or 422 when the closet can't make a complete outfit.

The Gemini work on the outfit route itself (weather, search, errors, prompts) is in section 8.

- [ ] `POST /api/stylist/outfit/accept { suggestionId, itemIds, name, eventName, date }` → `{ outfitId }`. Runs when the user taps "Looks right". It creates the `Outfit` (with its `OutfitItem`s) and a `CalendarEntry` for `date` with `eventName` **together, in one `prisma.$transaction`**, so neither is ever saved without the other. Build the outfit with the same service method as `POST /api/outfits` (section 9), passing the transaction client in. Check every item id belongs to the user (404 otherwise). After the transaction, log the accept so later suggestions can learn from it. `OutfitSlot` already has `outerwear` and `onepiece`.
- [ ] `POST /api/stylist/outfit/feedback { suggestionId, itemIds, feedback }` → 204. It saves the user's answer ("What would you rather wear?") to Style Preferences, which needs a new model. Using those preferences in the outfit prompt is in section 8.

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

### Outfit suggestions (`POST /api/stylist/outfit`, section 7)
- [ ] Pass the day's weather (from `WeatherService`, with `date`) into the query expansion and outfit prompts. Neither gets the weather yet, though both rely on it.
- [ ] `findCandidates` ignores the `season`, `formality`, `preferred_colors` and `exclude_colors` the query expansion returns. Decide whether to filter or rank by them.
- [ ] `findClosestItems` must skip items with `excludeFromSuggestions: true` once that column exists (its comment notes this; see "Wear tracking" in section 4).
- [ ] Return Gemini failures as 503 `{ message }`, like weather. Right now they surface as raw errors (the 422 for "not enough items" can stay).
- [ ] Use the Style Preferences saved by the feedback route (section 7) in the outfit prompt, so suggestions learn from what the user turned down.

### Prompts
- [ ] `ai/Prompts.md` has older drafts that differ from the prompts in `server/src/gemini/*/prompt.ts`. Update or delete it so there's one source.
- [ ] Later: the memory prompt noted at the end of `ai/Prompts.md` ("extract/attach memories relevant to the original user prompt").

## 9. Outfits and collections

The Outfits tab (`src/app/(tabs)/outfits.tsx`) is built: the "All saved outfits" card, the Favorites row, and a grid of collections the user can create, rename and delete. Until the routes below exist, `USE_COLLECTIONS_FIXTURE` in `src/services/outfits.ts` shows no saved outfits and starts with no collections, and changes only last until the app restarts. Accepting a Stylist suggestion saves an outfit into the fixture (while `USE_ACCEPT_FEEDBACK_FIXTURE` is on), so these screens can be tried without the server.

Tapping a card opens the collection screen (`src/app/collection/[id].tsx`, where `id` is `all`, `favorites` or a collection id): the title, the outfit count and a grid of outfits, each opening `src/app/outfit/[id].tsx`. In edit mode, a user collection can be renamed and have outfits added ("Add from all saved outfits") or removed. Favorites can have outfits added (favorited) or removed (unfavorited). All saved outfits can only delete outfits, after a confirmation.

### Server
- [ ] Schema: `Collection { id, userId, name, createdAt }` already exists, but its join table `CollectionItem` links **items**, and the app's collections hold **outfits**. Replace `CollectionItem` with `CollectionOutfit { collectionId, outfitId, addedAt }` (`@@id([collectionId, outfitId])`, plus the back-relation on `Outfit`), with a migration. Make collection names unique per user, ignoring case.
- [ ] `GET /api/collections` → `{ allOutfits: { count, cover }, favorites: { count, cover }, collections: [{ id, name, outfitCount, cover }] }` (`OutfitsOverview` in `src/services/outfits.ts`). `cover` is the items of the most recently added outfit, as `{ id, name, category, type, imageUrl }[]` (the app's category names and signed URLs, as `GET /api/items`), or `null` when there are no outfits. `favorites` counts outfits with `isFavorite: true`. Collections are newest first.
- [ ] `POST /api/collections { name }` → the new collection, in the same shape (`outfitCount: 0`, `cover: null`). Trim `name` and require 1-40 characters (400). A name the user already has is 409 `{ message }`, which the app shows as is.
- [ ] `PATCH /api/collections/:id { name }` → the renamed collection. Same validation, and 404 if it isn't the user's.
- [ ] `DELETE /api/collections/:id` → 204. Deletes the collection and its `CollectionOutfit` rows only. The outfits stay, so they're still in All saved outfits.
- [ ] Schema: add to `Outfit`, with a migration:
  - `timesWorn Int @default(0)`: how many times the whole outfit has been worn since it was created. Counting starts at creation.
  - `lastWorn DateTime?`: the most recent day it was worn, or `null` if never.
- [ ] An `OutfitsModule` (`server/src/outfits/`) with an `OutfitsService.create(userId, { name, itemIds }, tx?)` that both `POST /api/outfits` and the Stylist accept route (section 7) use. It checks that every item is the user's, and makes one `OutfitItem` per item with its `slot` worked out from the item's category (`top`, `bottom`, `outerwear`, `onepiece`, `shoes`, `accessory`) and a `zIndex` matching the app's flat-lay (outerwear below the top). Takes an optional transaction client so the accept route can create the `CalendarEntry` in the same transaction.
- [ ] `POST /api/outfits { name, itemIds }` → the new outfit, in the `GET /api/outfits` shape. For saving an outfit without planning it for a day (no `CalendarEntry`). `name` is 1-60 characters, `itemIds` 1-8 ids.
- [ ] `GET /api/outfits` → the user's outfits, newest first, each as `{ id, name, isFavorite, timesWorn, lastWorn, createdAt, items }` (`SavedOutfit` in `src/services/outfits.ts`), with `items` like `cover`. `lastWorn` and `createdAt` are ISO dates. `?favorite=true` returns only favorites. Used for All saved outfits, Favorites and the "Add outfits" picker.
- [ ] `GET /api/outfits/:id` → one outfit in the same shape, for the outfit details screen (`src/app/outfit/[id].tsx`). 404 if it isn't the user's.
- [ ] **The user's time zone**, so outfits count as worn at the user's own midnight. The app sends it automatically; it isn't a setting.
  - Schema: add `timeZone String @default("America/New_York")` to `User`, with a migration. It holds an IANA name like `"America/Chicago"`.
  - `PATCH /api/auth/me { timeZone }` → 204. Reject names that aren't real time zones with 400: check with `Intl.supportedValuesOf('timeZone')`, or by seeing whether `new Intl.DateTimeFormat('en-US', { timeZone })` throws.
  - Optionally accept `timeZone` in `POST /api/auth/signup` too, so new users have the right one from the start.
- [ ] **Marking outfits as worn.** An outfit counts as worn once the date of one of its calendar entries has passed **in the user's time zone**. Each entry counts once, so an outfit planned for three days that have all passed has been worn three times. Build it as an hourly job:
  - Schema: add `wornCountedAt DateTime?` to `CalendarEntry` (with a migration). It's `null` until the entry has been counted, and is what stops an entry being counted twice.
  - Install `@nestjs/schedule` and add `ScheduleModule.forRoot()`. A `WearTrackingService` runs a `@Cron` job at the start of every hour, so each user's entries are counted within an hour of their midnight.
  - Each run finds entries with `wornCountedAt: null` whose `date` is before today *in their user's `timeZone`*. In SQL, join `Outfit` and `User` and compare `"CalendarEntry"."date"::date < (now() AT TIME ZONE "User"."timeZone")::date`. For each one, in **one transaction**:
    1. Claim the entry with `updateMany({ where: { id, wornCountedAt: null }, data: { wornCountedAt: now } })`. If it updated 0 rows, another run already counted it, so skip it. This keeps it safe if two server instances run the job at once.
    2. Outfit: add 1 to `timesWorn`, and set `lastWorn` to the entry's `date` if that's later than the current `lastWorn`.
    3. Each of the outfit's items, through `OutfitItem`: add 1 to `timesWorn`. For `timesWornThisMonth`, first roll the item's period forward if it has run out (below), then add 1.
  - Count every item once per entry, even if the same item is in the outfit twice.
  - Entries already in the past when this ships are counted on the first run. Set `wornCountedAt` on them in the migration if they shouldn't be.
  - Run the job once when the server starts too, so days missed while the server was down are still counted.
- [ ] **Resetting `timesWornThisMonth` every 30 days.** Each item's period starts at its creation (`wearPeriodStart`, section 4), and the same hourly job resets it.
  - When `wearPeriodStart` is 30 or more days ago, set `timesWornThisMonth` to 0 and move `wearPeriodStart` forward by whole 30-day steps. This keeps the periods lined up with the item's creation date, even if the job missed some days.
  - Do the reset in one SQL `UPDATE` for all items: `"wearPeriodStart" = "wearPeriodStart" + floor(extract(epoch from now() - "wearPeriodStart") / 2592000) * interval '30 days'`.
  - Run the reset before counting new wears, and apply the same roll-forward when counting a wear, so a wear never lands in an old period.
- [ ] Wear counts that have already been added stay when an outfit or calendar entry is deleted later. Only entries that haven't been counted yet are affected.
- [ ] Later: let the user say they didn't wear a planned outfit (e.g. "Didn't wear it" on a past calendar day). That would undo the counts for that entry, rolling `lastWorn` back to the outfit's previous worn entry.
- [ ] `GET /api/collections/:id` → `{ id, name, outfits }`, with `outfits` as in `GET /api/outfits`, most recently added first. 404 if it isn't the user's.
- [ ] `POST /api/collections/:id/outfits { outfitIds }` → 204. Check that every outfit is the user's (404 otherwise), and skip ones already in the collection.
- [ ] `DELETE /api/collections/:id/outfits/:outfitId` → 204. Removes the outfit from the collection only.
- [ ] `PATCH /api/outfits/:id { isFavorite }` → 204 (or the outfit). Adding to and removing from Favorites uses this.
- [ ] `DELETE /api/outfits/:id` → 204. Deletes the outfit with its `OutfitItem` and `CollectionOutfit` rows. Decide what happens to `CalendarEntry` rows that point at it (delete them, or make `outfitId` optional so past days keep their entry).

### Client
- [ ] Switch `USE_COLLECTIONS_FIXTURE` off once the routes above are live.
- [ ] Add `timesWorn`, `lastWorn` and `createdAt` to `SavedOutfit` once the server sends them, and show them on the outfit details screen.
- [ ] Send the device's time zone to the server. Read it with `Intl.DateTimeFormat().resolvedOptions().timeZone` (no permission or package needed). When the app opens and after login, call `PATCH /api/auth/me { timeZone }`, but only if it differs from the last value sent. Keep that value in AsyncStorage, in `src/services/preferences.ts` next to the temperature unit. If the request fails, try again next launch. When the user travels, it updates the next time they open the app.

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3) (server done; S3 CORS still to check)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (server and client done; needs an end-to-end test)
6. Cutout and tagging (section 4) (done; backfilling older items, WebP conversion and `FITS` are in section 8)
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): the screen and the outfit route are built, with the agreed response shape. Next is passing in the weather (section 8), then the accept and feedback routes
9. Outfits and collections (section 9): the client screens are built on a fixture. Next on the server: the `CollectionOutfit` schema change, `OutfitsService.create` (which the accept route needs too) and the outfit and collection routes, then the time zone and wear tracking

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Test adding an item end to end against Railway (the server now also makes the cutout during that request). The nullable `category` and the TODO removal are done.
- [ ] Test location and the weather card on a real device with Expo Go or a development build, including the denied-permission path (section 6).
- [ ] Test the color dropper on the item details screen against the live `GET /api/items/:id/color-grid`. Then remove the stale "Not built on the server yet" comment above `getItemColorGrid` in `src/services/items.ts`.
- [ ] Test picking Fitted and Loose on the item details screen. The server's `Fit` enum now has both, so neither should return a 400 any more.
- [ ] Build the outfit details screen (`src/app/outfit/[id].tsx`) against the Outfits fixture (section 4, "Item details screen").
- [ ] Test the Outfits tab and the collection screen on a device: accept a Stylist suggestion, then create a collection, add and remove outfits, rename it, favorite and unfavorite, and delete an outfit (section 9).

### Needs a server decision first
- [ ] The link-import route (section 4), so `importItemFromLink` can go live.
- [ ] The Stylist accept and feedback routes (section 7), so `USE_ACCEPT_FEEDBACK_FIXTURE` can be switched off.
- [ ] The outfit and collection routes (section 9), so `USE_COLLECTIONS_FIXTURE` can be switched off and the outfit details screen can load from `GET /api/outfits/:id`.
- [ ] `PATCH /api/auth/me { timeZone }` (section 9), so the app can send the device's time zone.
- [ ] Wear counts and `excludeFromSuggestions` in `GET /api/items/:id` (section 4), so the item details screen can show wear stats and enable the exclude toggle.
- [ ] `outfits` in `GET /api/items/:id` (section 4), so "Saved in outfits" can show the item's outfits.

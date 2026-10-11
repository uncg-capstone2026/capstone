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

All done.

## 4. Closet items

Clothing photos live in AWS S3. The client uploads the original photo, and the server cuts the piece out and stores the cutout in S3 as well (`Item.imageKey` for the original, `Item.cutoutKey` for the cutout).

- [ ] Test adding an item by link on a device: a new link opens the confirm screen, and pasting the same link again opens the existing item's details.
- [ ] If the app is closed on the confirm screen, the item stays in the closet unchecked (and untagged until tagging is wired in). Later, an `isConfirmed` flag on `Item` (hidden from `GET /api/items` until Save) would stop that.

### Item details screen

Tapping an item in the closet opens `src/app/item/[id].tsx`. The screen is built. The server now sends everything it shows: wear stats, "Saved in outfits", the exclude toggle, the Fitted and Loose fit steps and the color dropper.

All done.

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
All done.

### Client

All done.

## 7. Stylist ("Plan an outfit")

The Stylist tab (`src/app/(tabs)/stylist.tsx`) is the start of the AI chat. The user picks any upcoming day (defaulting to today), sees that day's weather, types where they're headed, and taps "Style my outfit →".

### Client
The suggestion screen (`src/app/suggestion.tsx`) is built. "Style my outfit" opens it, and it shows one outfit at a time as a flat-lay, with "Not for me" and "Looks right". It calls the live `POST /api/stylist/outfit` (`USE_OUTFIT_FIXTURE` is off). "Looks right" calls `POST /api/stylist/outfit/accept` with the `sessionId` and `turnId`, which saves the outfit with a calendar entry for the day and closes the session. "Not for me" sends the answer to `POST /api/stylist/outfit/reprompt` and goes straight to the next outfit in the same session (`USE_ACCEPT_FEEDBACK_FIXTURE` is off).

- [ ] Style Preferences (`src/app/style-preferences.tsx`, "See what was remembered") is a "coming soon" placeholder.

### Server
Outfit suggestions are sessions of turns (`ai/repromptimplementation.md`, API in `server/CLAUDE.md`). `POST /api/stylist/outfit { occasion, date?, lat?, lon? }` starts a session and returns `OutfitSuggestion` plus `sessionId` and `turnId`. `POST /api/stylist/outfit/reprompt { sessionId, message? }` returns the next outfit, and `POST /api/stylist/outfit/accept` closes the session. `POST /api/stylist/try-on` is done too.

- [ ] Remove `excludeSuggestionIds` from `POST /api/stylist/outfit` and `POST /api/stylist/outfit/feedback`: the app no longer uses either.

The remaining Gemini work is in section 8.

## 8. AI (Gemini)

Everything that touches Gemini, the embeddings or the pgvector search: setup, item tagging, and the outfit suggestion route. The code is in `server/src/gemini/` and `server/src/stylist/`.

### Setup and security
- [ ] Add `GEMINI_API_KEY` to `server/.env` and the Railway variables (`server/.env.example` has it). Without it, every Gemini call fails.
- [ ] Database: the init migration creates an `embedding vector(768)` column but never runs `CREATE EXTENSION vector`. Check pgvector is enabled on Railway, and add a migration with `CREATE EXTENSION IF NOT EXISTS vector` so a fresh database works.
- [ ] `server/src/main.ts` now loads `.env` with `dotenv/config` as well as `ConfigModule`. Keep one. `GeminiHelpers` reads `process.env.GEMINI_API_KEY` directly, so whichever stays must load before it.

### Item tagging and embeddings (section 4)
- [ ] `FITS` in `server/src/gemini/constants.ts` still uses `Relaxed` and has no `Fitted`, so the AI never tags an item Fitted. Change it to `['Fitted', 'Slim', 'Regular', 'Loose', 'Oversized']` to match the `Fit` enum. (`item-mappings.ts` already maps `Relaxed` to `Loose`, so nothing breaks in the meantime.)
- [ ] `PATCH /api/items/:id` accepts any `type` up to 50 characters, but the Stylist search matches `type` exactly against `CLOTHING_TYPES` in `server/src/gemini/constants.ts`. Validate `type` against that list, and make the list available to the app (send it, or add `GET /api/items/types`).
- [ ] Backfill `type` and `embedding` for items added before tagging and embedding were wired in, since the Stylist search skips items without them.
- [ ] Gemini only accepts PNG and JPEG (`EMBEDDABLE_IMAGE_TYPES`), but the upload routes also accept WebP. When there's no cutout, a WebP original is currently skipped (no tags or embedding). Convert it to JPEG with sharp instead.
- [ ] Add `cut` to AI tagging. `extractImageAttributes` fills every other tag but not `cut`, so it's always empty until the user picks one. Add it to the image-attributes schema, prompt and result type (`server/src/gemini/image-processing/`), and save it in `ItemsService.createFromPhoto` with the other tags. Pick from the cuts the app offers for the item's category (`COMMON_CUTS` in `client/src/services/items.ts`; copy the list into `server/src/gemini/constants.ts`, since the server can't import from the client), or `null` if it can't tell or the category has no cuts. The confirm screen already shows `cut` and marks AI-filled fields, so the app needs no change.

### Outfit suggestions (`POST /api/stylist/outfit`, section 7)
- [ ] Server: make "Exclude from future outfit suggestions" work. `findClosestItems` in `server/src/gemini/outfit-planning/service.ts` is where all Stylist candidates come from, but it doesn't check `excludeFromSuggestions` yet (its "Later" comment says it's waiting for the column, which exists now). Add `AND "excludeFromSuggestions" = false` to its `WHERE`, and update the comment. Also check the two Oct 7 migrations have run on Railway (`build` and `start` don't run `prisma migrate deploy`). To test: exclude an item, ask the Stylist for an outfit it would suit, and check it's never suggested. (See "Wear tracking" in section 4.)
- [ ] Later: memory from past sessions, so suggestions learn from what the user turned down before (`memoryProcessed` on `OutfitSession` is there for it). This replaces the old feedback route, which saved answers nothing read.

### Prompts
- [ ] `ai/Prompts.md` has older drafts that differ from the prompts in `server/src/gemini/*/prompt.ts`. Update or delete it so there's one source.
- [ ] Later: the memory prompt noted at the end of `ai/Prompts.md` ("extract/attach memories relevant to the original user prompt").

## 9. Outfits and collections

The Outfits tab (`src/app/(tabs)/outfits.tsx`) is built: the "All saved outfits" card, the Favorites row, and a grid of collections the user can create, rename and delete. They use the live outfit and collection routes (`USE_COLLECTIONS_FIXTURE` is off).

Tapping a card opens the collection screen (`src/app/collection/[id].tsx`, where `id` is `all`, `favorites` or a collection id): the title, the outfit count and a grid of outfits, each opening `src/app/outfit/[id].tsx`. In edit mode, a user collection can be renamed and have outfits added ("Add from all saved outfits") or removed. Favorites can have outfits added (favorited) or removed (unfavorited). All saved outfits can only delete outfits, after a confirmation.

### Server
- [ ] Account screen (`src/app/profile.tsx`) needs three routes. The app already calls them and shows "isn't available yet" until they exist:
  - `PATCH /api/auth/me` accepts `email`: check it with `isValidEmail` and save it with `normalizeEmail` (`server/src/auth/auth.utils.ts`, same as sign-up), 409 "Email already in use". Right now `parseProfileChanges` rejects it ("email can't be changed here").
  - `POST /api/auth/me/password { currentPassword, newPassword }` → 204. A wrong current password must be a **400** "Current password is incorrect", not a 401: the app treats any 401 as an expired session and signs the user out. Check the new password with `assertStrongPassword` (`auth.utils.ts`, same as sign-up: 8+ characters, upper, lower, number).
  - `DELETE /api/auth/me` → 204. Deletes the user (the relations cascade) and their S3 files: item photos and cutouts, body photos.
- [ ] Optional cleanup: outfit reminders are local notifications scheduled by the app, so `notificationsEnabled` on `User`, `POST /api/auth/me/push-token`, the `PushToken` model and the `Notification` model are unused. Remove them, or keep them for server-sent push later (which would need an Apple Developer account and APNs key). `marketingOptIn` is no longer sent at sign-up either.
- [ ] Later: let the user say they didn't wear a planned outfit (e.g. "Didn't wear it" on a past calendar day). That would undo the counts for that entry, rolling `lastWorn` back to the outfit's previous worn entry.

### Client
The pieces and schedule routes, `scheduled` and `collections` on `GET /api/outfits/:id`, and `GET /api/photos/body` are now live on the server (PRs #44 and #45). So are `GET /api/calendar`, `PATCH /api/auth/me` with `name`, `displayName`, `phone` and `notificationsEnabled`, and `POST /api/auth/me/push-token { token }`.

- [ ] Outfit reminders (local notifications, `src/services/reminders.ts`): make a new dev build (`npx expo run:ios`, since `expo-notifications` is native), then test on a device: the prompt after sign-up, a reminder at 5 PM the day before a planned day (one or several outfits), tapping it opens the Calendar, planning or unplanning updates it, the Settings switch (including after denying the prompt), and that signing out clears them.
- [ ] Account screen (`src/app/profile.tsx`): test changing email and password and deleting the account on a device once the server routes above exist.

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3) (done)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (done)
6. Cutout and tagging (section 4) (done; backfilling older items, WebP conversion and `FITS` are in section 8)
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): sessions, reprompting, accept and try-on are done on the server, and the app uses them. The first request sends the location, so suggestions use the weather
9. Outfits and collections (section 9): the client screens are built and use the live routes. The schema, `OutfitsService.create` and the outfit and collection routes are done on the server. So are `PATCH /api/auth/me { timeZone }` and the hourly wear tracking job. The app sends the device's time zone. The outfit details screen, wear stats and the Calendar tab are built and tested on a device

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Test adding by link on a device (section 4).
- [ ] Test outfit reminders on a device after a new dev build (section 9).
- [ ] Test name and mobile saving on the Account screen on a device (section 9).

### Needs a server decision first

Nothing right now.

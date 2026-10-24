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


### Server
Outfit suggestions are sessions of turns (`ai/repromptimplementation.md`, API in `server/CLAUDE.md`). `POST /api/stylist/outfit { occasion, date?, lat?, lon? }` starts a session and returns `OutfitSuggestion` plus `sessionId` and `turnId`. `POST /api/stylist/outfit/reprompt { sessionId, message? }` returns the next outfit, and `POST /api/stylist/outfit/accept` closes the session. `POST /api/stylist/try-on` is done too.


The remaining Gemini work is in section 8.

## 8. AI (Gemini)

Everything that touches Gemini, the embeddings or the pgvector search: setup, item tagging, and the outfit suggestion route. The code is in `server/src/gemini/` and `server/src/stylist/`.

### Setup and security
- [ ] Check the `enable_pgvector` migration has run on Railway (`build` and `start` don't run `prisma migrate deploy`).

### Item tagging and embeddings (section 4)
- [ ] Backfill `type` and `embedding` for items added before tagging and embedding were wired in, since the Stylist search skips items without them.
- [ ] Add more accessory types. `hat` is the only type in the Accessory category, and the type has to come from `CLOTHING_TYPES` (`server/src/gemini/constants.ts`), so a bag, belt, scarf or pair of sunglasses gets forced into the closest type (often `hat`, or something unrelated) and the wrong category. Add e.g. `bag`, `belt`, `scarf`, `sunglasses`, `socks`, `jewelry` and `watch` to `CLOTHING_TYPES` and map them to `Accessory` in `CATEGORY_BY_TYPE`. The tagging prompt lists each category's types from these, so it picks them up. Once it's in, the client copies (`CLOTHING_TYPE_OPTIONS` and `CATEGORY_BY_TYPE` in `client/src/services/items.ts`) need the same types with labels.
- [ ] Make the Cut and Type of accessories match. Accessory cuts are `GENERAL_CUTS` (`Classic`, `Cropped`, `Longline`, `Asymmetric`), which don't describe a hat or a bag. Replace them with the Accessory types themselves (`Hat`, `Bag`, `Belt`, …) in `CUTS_BY_CATEGORY` (`server/src/gemini/constants.ts`), and have tagging set an accessory's cut to the label of its type. Fix accessories already saved with a `GENERAL_CUTS` cut the same way. The client copy (`COMMON_CUTS.accessories` in `client/src/services/items.ts`) needs the same list, and changing an accessory's Type in the edit form should update its Cut to match. Do this after the task above, so the list has every accessory type.
- [ ] Move `hoodie` and `cardigan` from `Top` to `Outerwear` in `CATEGORY_BY_TYPE`, and fix the category on items already saved with those types (a one-off update: `category = 'Outerwear' where type in ('hoodie', 'cardigan')`). Their cuts then come from the Outerwear list (which has `Hooded`, `Cropped` and `Longline`). Check the outfit rules first: a complete outfit needs a top and bottoms (`isCompleteOutfit` in `server/src/gemini/outfit-planning/candidates.ts`), so a hoodie worn as the only top would no longer count as one, and the Stylist would always add a top under it. The client copy of `CATEGORY_BY_TYPE` needs the same change.

### Outfit suggestions (`POST /api/stylist/outfit`, section 7)

### Prompts
- [ ] Later: a memory prompt that extracts and attaches memories relevant to the original user prompt (noted in the old `ai/Prompts.md`, now deleted).

## 9. Outfits and collections

The Outfits tab (`src/app/(tabs)/outfits.tsx`) is built: the "All saved outfits" card, the Favorites row, and a grid of collections the user can create, rename and delete. They use the live outfit and collection routes (`USE_COLLECTIONS_FIXTURE` is off).

Tapping a card opens the collection screen (`src/app/collection/[id].tsx`, where `id` is `all`, `favorites` or a collection id): the title, the outfit count and a grid of outfits, each opening `src/app/outfit/[id].tsx`. In edit mode, a user collection can be renamed and have outfits added ("Add from all saved outfits") or removed. Favorites can have outfits added (favorited) or removed (unfavorited). All saved outfits can only delete outfits, after a confirmation.

### Server
- [ ] Optional cleanup: outfit reminders are local notifications scheduled by the app, so `notificationsEnabled` on `User`, `POST /api/auth/me/push-token`, the `PushToken` model and the `Notification` model are unused. Remove them, or keep them for server-sent push later (which would need an Apple Developer account and APNs key). `marketingOptIn` is no longer sent at sign-up either.
- [ ] Optional "Didn't wear it" fix: `uncountWear` takes the wear off the outfit's current pieces. If the pieces were edited after the day was counted, the wrong items lose a wear. To fix it, record which items were counted for each entry when the job counts it (for example a `countedItemIds String[]` on `CalendarEntry`), and subtract from those.

### Client
The pieces and schedule routes, `scheduled` and `collections` on `GET /api/outfits/:id`, and `GET /api/photos/body` are now live on the server (PRs #44 and #45). So are `GET /api/calendar`, `PATCH /api/auth/me` with `name`, `displayName`, `phone` and `notificationsEnabled`, and `POST /api/auth/me/push-token { token }`.

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3) (done)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (done)
6. Cutout and tagging (section 4) (done; backfilling older items and `FITS` are in section 8)
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): sessions, reprompting, accept and try-on are done on the server, and the app uses them. The first request sends the location, so suggestions use the weather
9. Outfits and collections (section 9): the client screens are built and use the live routes. The schema, `OutfitsService.create` and the outfit and collection routes are done on the server. So are `PATCH /api/auth/me { timeZone }` and the hourly wear tracking job. The app sends the device's time zone. The outfit details screen, wear stats and the Calendar tab are built and tested on a device

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now

Nothing right now.

### Needs a server decision first

Nothing right now.

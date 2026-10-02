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
5. **Tag it.** Send the cutout to an AI vision model to fill in `category`, `type`, `colorHex` (1–3 values), `pattern`, `material`, `fit` and a short `name`. Ask for JSON and validate it against the Prisma enums before saving.
6. Optionally, create the `embedding` for outfit suggestions at the same point.
7. Update the `Item` with the cutout and tags, then return `{ itemId }`.

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
- [ ] The results view (the chat showing the outfit) once the server route exists.

### Server
- [ ] Build the outfit route, e.g. `POST /api/stylist/outfit { date: 'YYYY-MM-DD', occasion }` → one outfit built from the signed-in user's closet, using that day's weather. Nothing is saved ("This chat isn't saved"). Agree the response shape with the client first.

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3) (server done; S3 CORS still to check)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (server and client done; needs an end-to-end test)
6. Cutout and tagging (section 4): background removal done; AI tagging next
7. Weather (section 6) (done, including `?date=` for the Stylist day picker)
8. Stylist (section 7): the screen is built. Next is the outfit route

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Make `ClosetItem.category` nullable, show untagged items under "All", and check the closet grid and filters handle `null`. Then remove the TODO above `uploadItemPhoto` and test adding an item end to end against Railway (the server now also makes the cutout during that request).

### Needs a server decision first
- [ ] The link-import route (section 4), so `importItemFromLink` can go live.

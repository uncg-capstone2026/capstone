# Connecting the client to the server

The Expo app (`client/`) and the NestJS server (`server/`) can't talk to each other yet. This file lists everything needed to connect them, in the order to do it, and tracks what's done.

## 1. Basic server setup (blocks everything else)

- [x] **Load env variables.** Nest doesn't read `.env` files by itself, and the server has no `@nestjs/config` or `dotenv`. So `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_BUCKET_NAME` are currently undefined. Add config loading plus a `server/.env.example`.
- [x] **Add database access.** `@prisma/client` is installed, but nothing in `src/` uses it. Add a `PrismaService` and `PrismaModule`.
- [x] **Add the `/api` prefix.** Every app request starts with `/api/...`, but the server's routes don't. Add `app.setGlobalPrefix('api')` in `server/src/main.ts`.
- [x] **Enable CORS** with `app.enableCors()` in `main.ts`. Only the web build needs it.
- [x] **Point phones at the server.** `EXPO_PUBLIC_API_URL` in `client/.env.local` is set to the Railway deployment, `https://capstone-production-1452.up.railway.app`. (For a server running on a laptop instead, use its Wi-Fi IP, e.g. `http://192.168.1.20:3000`. `localhost` on a phone means the phone itself.)

## 2. Auth (needed before any real data)

### Server
- [x] Add `POST /api/auth/signup` and `POST /api/auth/login`. Login accepts an email **or** a phone number, matching the Email/Phone toggle on the login screen.
- [x] Hash passwords with bcrypt or argon2 into `User.passwordHash`.
- [x] Issue a JWT with `{ sub: user.id }` using `@nestjs/jwt`, and add an auth guard that sets `req.user` from it.
- [x] Schema changes to `User`:
  - `displayName` is required, but sign-up only collects `name`. Make it optional or copy `name` into it.
  - `phone` needs `@unique` so a phone-number login finds exactly one user.
  - Add `marketingOptIn Boolean @default(false)` for the sign-up checkbox.
- [x] Enforce the same rules as the sign-up screen, since client checks can be bypassed (see `src/utils/validation.ts`):
  - Trim and lowercase emails before saving or looking them up.
  - Phone arrives as E.164 (`+13365550123`, US only for now). Store it that way. Login by phone should normalize the typed number the same way.
  - Password: at least 8 characters, with an uppercase letter, a lowercase letter and a number.
  - Return a clear error for "email already taken" (e.g. 409 with a message), so the app can show it under the email field.
- [ ] Later: Apple and Google sign-in, which each need server-side token verification.

### Client
- [x] Wire `signUpWithPassword` and `loginWithPassword` in `src/services/auth.ts` to the new routes. Both return `{ token, user }`. Login takes `{ email, password }` or `{ phone, password }`, not `mode`/`identifier`. Errors come back as `{ message }`: 409 "Email already in use" / "Phone number already in use", 400 for validation, 401 for a wrong login.
- [x] Store the token with `expo-secure-store` (`npx expo install expo-secure-store`).
- [x] Make `isSignedIn()` read the stored token. Reading it is async, so `src/app/index.tsx` needs a short loading state before redirecting.
- [x] Send `Authorization: Bearer <token>` on every API request (`src/services/photos.ts`, `src/services/items.ts`).
- [x] After a successful login, navigate: `router.replace('/closet')` in `src/app/(auth)/login.tsx`. Right now it does nothing on success.
- [x] Add sign-out (clear the token), e.g. from the Settings tab.

## 3. Body photo upload

The client and server currently disagree on almost every detail:

| | App calls | Server has |
|---|---|---|
| Get an upload URL | `POST /api/photos/body/upload-url` `{ contentType, fileName }` → `{ uploadUrl, key }` | `POST /uploads/body-photo` `{ userId, contentType }` → `{ key, url }` |
| Save it to the user | `POST /api/photos/body` `{ key }` | **missing** |

- [ ] Agree on one route name and one response field name (`uploadUrl` vs `url`), then update whichever side changes.
- [ ] Server: take `userId` from the token, not the request body. Otherwise anyone can upload into another user's folder.
- [ ] Server: build the "save" route. It checks the file exists in S3, then creates a `TryOnPhoto` with `isPrimary: true`.
- [ ] Server: `buildKey` now takes an extension and `S3Service.extensionFor` maps JPEG/PNG/WebP to one (added for item photos). The body route still passes `'jpg'`. Use `extensionFor` there too and reject anything that isn't an image.
- [ ] S3: the bucket's CORS settings must allow `PUT` from the app, or web uploads fail.
- [ ] Server: remove the old `POST /uploads/clothing` and `POST /uploads/body-photo` routes in `s3.controller.ts` once the body route is replaced. They have no auth guard and take `userId` from the body, so anyone can get an upload URL into any user's folder. `/api/items/photo/upload-url` already replaces the clothing one.

## 4. Closet items

Clothing photos live in AWS S3. The client uploads the original photo, and the server cuts the piece out and stores the cutout in S3 as well (`Item.imageKey` for the original, `Item.cutoutKey` for the cutout).

- [x] Server: build `GET /api/items`, returning the signed-in user's items as `{ id, name, category, imageUrl, isFavorite }` (the client's `ClosetItem` type in `src/services/items.ts`).
- [x] Server: `imageUrl` is a signed download URL for `cutoutKey`, falling back to `imageKey` until the cutout is ready.
- [ ] Server: `getDownloadUrl` signs for 5 minutes, which will break the app's cached images. Use a longer expiry or a CloudFront URL.
- [x] Category names don't match. The server uses `Top`, `Bottoms`, `Accessory`, `OnePiece`, while the client uses `tops`, `accessories`, `one-piece` and so on. Pick one side to change, or convert in the route. (Done: the route converts them, and the client keeps its names.)
- [x] Schema additions to `Item`: `isFavorite Boolean @default(false)` and a `Sets` value in `Category`.
- [x] Adding items from a photo. The server routes match what `uploadItemPhoto` in `src/services/items.ts` already calls:
  1. `POST /api/items/photo/upload-url { contentType, fileName }` → `{ uploadUrl, key }`, a presigned S3 PUT. Only `image/jpeg`, `image/png` and `image/webp` are accepted (400 otherwise).
  2. The app PUTs the image straight to S3.
  3. `POST /api/items/photo { key }` → `{ itemId }`. It checks the key is in the user's own folder and exists in S3 (404 otherwise), and returns the existing item if the same key is sent twice. For now it only saves `imageKey`: the item gets `name: "New item"` and no category or type. Cutout and tagging come later (see below).
- [x] Schema: `Item.category` and `Item.type` are now optional and `name` defaults to `"New item"`, so an item can be saved before it's tagged.
- [ ] Client: `GET /api/items` can now return `category: null`. Make `ClosetItem.category` nullable, and decide where untagged items show (at least under "All"). Check the closet grid and filters don't break on `null`.
- [ ] Client: remove the "backend routes not built yet" TODO above `uploadItemPhoto`, and test the upload end to end against Railway.
- [ ] Client: check which content types the picker actually sends. The server rejects anything but JPEG, PNG and WebP, so an iOS HEIC photo would fail. Convert it or show a clear error.
- [ ] Adding items from a link (the client calls `importItemFromLink`, currently a "coming soon" stub): a route that fetches the product page, saves the product image to S3 and returns details for the user to confirm.
- [ ] Client: a "confirm details" screen after adding, where the user checks what StyleMe filled in.

### Item details screen

Tapping an item in the closet opens a details screen. `GET /api/items` only returns `{ id, name, category, imageUrl, isFavorite }`, which isn't enough, and nothing can change or remove an item yet.

- [ ] Server: build `GET /api/items/:id`, returning the full item: the list fields plus `type`, `cut`, `colorHex`, `pattern`, `material`, `season`, `formality`, `fit`, `sourceURL` and `createdAt`. Agree the response shape with the client first (a `ClothingItemDetails` type in `src/services/items.ts`). Convert `category` the same way the list route does. `category` and `type` can be `null` for untagged items.
- [ ] Server: build `PATCH /api/items/:id` for the favorite toggle and edits (e.g. `{ isFavorite }`, `{ name }`). Validate edited values against the Prisma enums.
- [ ] Server: build `DELETE /api/items/:id`. It should also delete `imageKey` and `cutoutKey` from S3. Decide what happens to outfits and collections that include the item.
- [ ] Server: every `:id` route must check the item belongs to the signed-in user. Return 404 (not 403) otherwise, so item ids can't be probed.
- [ ] Server: `imageUrl` in the details response is a fresh signed URL, so the details screen doesn't show the expired URL from the closet grid (see the expiry note above).
- [ ] Seed a few tagged items for the test account. Items added from a photo have no tags yet, so the closet filters and details screen need seeded data to test against.

### Cutout and tagging (server side)

The background is removed on the **server**, not the phone. That gives the same result on iOS, Android and web, works in Expo Go, and can be changed without an app update. The server already has to look at the photo to fill in category, color and fit, and that AI key must stay server-side anyway.

What happens in step 3 above (`POST /api/items/photo { key }`). Step 1 is built, and the item is already created with just `imageKey` before the cutout. The `// Later:` comment in `ItemsService.createFromPhoto` marks where steps 2–6 go.
1. ~~Check the key belongs to the signed-in user (`users/<sub>/clothing/...`) and that the object exists in S3.~~ Done.
2. Download the original from S3. Resize it (e.g. longest side 1024px) to keep processing fast and cheap.
3. **Cut it out.** Pick one:
   - **Amazon Bedrock, Nova Canvas (recommended to start).** It has a background-removal mode. Call it from NestJS with `@aws-sdk/client-bedrock-runtime`, alongside the existing S3 SDK, so there's no model to host. It costs a few cents per image. Check it's available in your AWS region and that model access is enabled on the account.
   - **Self-hosted rembg.** A free, open-source Python library. It needs a small Python service next to the Node server and a machine with enough memory for the model. If you use a Node background-removal library instead, check its licence (some are AGPL).
4. Save the result as a transparent PNG to S3 (e.g. `users/<sub>/clothing/<uuid>-cutout.png`) and set `Item.cutoutKey`. `S3Service.buildKey(userId, 'clothing', 'png')` builds the key, but the `-cutout` suffix pairing it with the original isn't supported yet.
5. **Tag it.** Send the cutout to an AI vision model to fill in `category`, `type`, `colorHex` (1–3 values), `pattern`, `material`, `fit` and a short `name`. Ask for JSON and validate it against the Prisma enums before saving.
6. Optionally, create the `embedding` for outfit suggestions at the same point.
7. Update the `Item` with the cutout and tags, then return `{ itemId }`.

How it runs:
- [ ] **Start synchronous.** Do all of the above inside the request and reply when it's finished. That takes a few seconds, which the app's "StyleMe is cutting it out…" overlay already covers.
- [ ] **Later, if it's slow:** reply straight away with the item saved using only `imageKey`, and do steps 3–6 in the background, e.g. with an S3-triggered Lambda or a job queue. The `imageUrl` fallback (cutout if ready, otherwise the original) already handles the gap.
- [x] If the cutout fails, still save the item with the original photo, rather than making the user retake it. (Already true: the item is saved before any cutout runs. Keep it that way when steps 2–6 are added.)

Possible later extra: on-device cutout on iOS 17+ (Apple's Vision framework) for an instant preview while the server makes the final version. It needs a custom native module and doesn't work in Expo Go.

## 5. Client cleanups

- [x] Comments in `src/services/auth.ts` and `.env.example` say the backend is **Next.js**. It's **NestJS**.

## 6. Weather (WeatherAPI.com)

Outfit suggestions should take the weather into account. Weather data comes from [WeatherAPI.com](https://www.weatherapi.com). It uses a plain API key (no JWT like Apple WeatherKit), doesn't need an Apple Developer membership, and works on iOS and Android. The app never calls WeatherAPI.com directly. It calls our server, and the server calls WeatherAPI.com, so the key never ships in the app bundle.

### Server
- [ ] Sign up for a WeatherAPI.com key and add `WEATHERAPI_KEY` to `server/.env` and the Railway variables. (`server/.env.example` has it.) Without it, every weather request fails.
- [x] Add a `WeatherModule` with a `WeatherService` and `WeatherController`.
- [x] Build `GET /api/weather?lat=..&lon=..` behind the auth guard, so strangers can't use up the quota. Also accepts `?q=<city>` for users who don't share their location.
- [ ] **Validation doesn't run yet.** `WeatherQueryDto` has the right `class-validator` rules, but the controller's `@Query()` has no `ValidationPipe` and there's no global one in `main.ts`. Out-of-range `lat`/`lon` go straight to WeatherAPI.com, and a request with no parameters asks for `NaN,NaN`. Use `@Query(new ValidationPipe({ transform: true }))`, like the items controller does for bodies.
- [x] The service calls `forecast.json?...&days=1` and returns only what the app needs:
  `{ tempC, feelsLikeC, highC, lowC, tempF, feelsLikeF, highF, lowF, condition, iconUrl, chanceOfRain, uvIndex, windKph, locationName }`.
  Fahrenheit fields were added alongside Celsius. `iconUrl` already has `https:` added.
- [x] Responses are cached for 10 minutes in memory, keyed by coordinates rounded to 2 decimals (about 1 km) or the lowercased city.
- [ ] Later: the cache `Map` never drops expired entries. Fine for now. Evict old entries or cap its size if it grows.
- [x] Error handling: 503 `{ message: "Weather is unavailable right now" }` if WeatherAPI.com fails or takes more than 5 seconds, and 400 `{ message: "Location not found" }` for an unknown city. The upstream URL (which contains the key) is never logged or returned.
- [ ] **Weather for a chosen day.** Accept `?date=YYYY-MM-DD` (today through 7 days out; 400 `{ message }` outside that range). The Stylist screen already sends it for any day after today. Call `forecast.json` with `days` = days ahead + 1 and pick that day. Add `date` to the response, since the app uses it to check it got the right day. For a future day, fill `temp`/`feelsLike` from the day's average (`avgtemp_c`/`avgtemp_f`), because the app only shows high/low, condition and rain chance for those days. Include the date in the cache key. Check the WeatherAPI.com plan allows 7 forecast days. Until this ships, the app shows "Forecast for this day isn't available yet." for future days.
- [ ] Later: fill `CalendarEntry.weatherSummary` and `tempHigh` when an outfit is planned for a date (the forecast endpoint takes `days` up to the plan's limit).

### Client
- [x] Install `expo-location` (`npx expo install expo-location`) and add its config plugin to `app.json` with a clear permission message: "StyleMe uses your location to suggest outfits for today's weather." Apple rejects vague messages. Only the when-in-use message is set. The always-allowed and motion messages are turned off (`false`), so the plugin's generic default text doesn't end up in the app.
- [x] Add `src/services/weather.ts` with `getWeather({ lat, lon } | { city })`, using `apiGet` from `src/services/api.ts` so it sends the token and handles expired sessions like other requests. Add a `Weather` type matching the server response above. It shows the server's 400/503 messages ("Location not found", "Weather is unavailable right now") and returns `null` when no backend is configured.
- [x] Add a °F / °C option to the Settings tab (decided: a setting, not the device locale). The server sends both, so switching doesn't need a new request. It defaults to °F and is saved on the device with AsyncStorage (`src/services/preferences.ts`). It isn't cleared on sign-out. The weather card should read it with `useTemperatureUnit()` (`src/hooks/use-temperature-unit.ts`) and get the numbers from `temperaturesIn(weather, unit)` in `src/services/weather.ts`.
- [x] Add a `useWeather` hook (`src/hooks/use-weather.ts`): ask for foreground location permission, get the position (a reading from the last 10 minutes if there is one, otherwise `Accuracy.Low`), call `getWeather`, and expose `{ weather, loading, error, permissionDenied, refresh }`.
- [x] Decided: if location permission is denied, hide the weather section (no city fallback). `useWeather()` already reports this as `permissionDenied: true` with `weather: null`.
- [x] `getWeather(location, date?)` and `useWeather(date?)` take an optional day and send `&date=YYYY-MM-DD` for any day after today.
- [x] Add a small weather card (`src/components/stylist/weather-card.tsx`) on the Stylist tab for the chosen day. Today shows the icon, temperature, feels-like, high/low and chance of rain; a future day shows the condition, high/low and rain. It renders nothing when `permissionDenied` is true or no backend is configured.
- [ ] Location needs a development build or Expo Go on a real device. Test the denied-permission path too.

## 7. Stylist ("Plan an outfit")

The Stylist tab (`src/app/(tabs)/stylist.tsx`) is the start of the AI chat. The user picks any upcoming day (defaulting to today), sees that day's weather, types where they're headed, and taps "Style my outfit →".

### Client
- [x] Screen layout: mascot, "Plan an outfit", the DAY picker, weather card, "Where are you headed?" text box, button and disclaimer.
- [x] DAY picker (`src/components/stylist/day-picker.tsx`): `DateTimePicker` from `@expo/ui/community/datetime-picker`, from today onward with no upper limit. Past 7 days out (`FORECAST_DAYS_AHEAD` in `src/services/weather.ts`), the weather card is hidden and no weather request is made. Android shows its dialog; iOS shows the inline calendar in a bottom sheet. `day-picker.web.tsx` uses the browser's date input, because `@expo/ui` renders nothing on web.
- [x] `styleOutfit({ date, occasion })` in `src/services/stylist.ts` is a stub that throws "Outfit styling is coming soon."
- [ ] The results view (the chat showing the outfit) once the server route exists.

### Server
- [ ] Build the outfit route, e.g. `POST /api/stylist/outfit { date: 'YYYY-MM-DD', occasion }` → one outfit built from the signed-in user's closet, using that day's weather. Nothing is saved ("This chat isn't saved"). Agree the response shape with the client first.

## Suggested order

1. Basic server setup (section 1) (done)
2. Auth, plus navigating after login (section 2) (done)
3. Body photo routes: the smallest real end-to-end test (section 3)
4. Items list (section 4) (done)
5. Add-item flow (section 4): upload first, saving the item with just the original photo (server done; client needs the `null` category fix and an end-to-end test)
6. Cutout and tagging (section 4): add background removal, then AI tagging
7. Weather (section 6): today's weather works end to end. Next is the server's `?date=` support for the Stylist day picker
8. Stylist (section 7): the screen is built. Next is the outfit route

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [x] Fix the "Next.js" comments in `src/services/auth.ts` and `.env.example` to say NestJS.
- [x] Add `router.replace('/closet')` after a successful login in `src/app/(auth)/login.tsx`.
- [x] Install `expo-secure-store` and add a small session module (save, read and clear the token).
- [x] Move `apiPost` out of `src/services/photos.ts` into a shared `src/services/api.ts` (with `apiGet`) that adds the `Authorization` header automatically. Use it in `photos.ts`, `items.ts` and `auth.ts`. (`auth.ts` has no requests yet, so it starts using it when sign-up and login are wired up.)
- [x] Wire `signUpWithPassword` and `loginWithPassword` to `POST /api/auth/signup` and `POST /api/auth/login`, and save the returned token. Show the 409 "already in use" message under the email or phone field.
- [x] Send the `Authorization` header from `listItems()`, so the closet loads from `GET /api/items` (depends on the shared `api.ts` above).
- [x] Make `isSignedIn()` async and add a loading state in `src/app/index.tsx`.
- [x] Add a sign-out button to the Settings tab.
- [x] Move the photo picker to `src/components/photo-picker.ts` with a neutral default file name, so the add-item screen can reuse it.

### Needs a server decision first
- [x] Auth request and response shapes, including the error for an email that's already taken.
- [ ] Body photo route names and the `uploadUrl`/`url` field name.
- [x] Category naming for items.
- [x] The item-photo routes (section 4). `uploadItemPhoto` can go live once `ClosetItem.category` allows `null`.
- [ ] The link-import route (section 4), so `importItemFromLink` can go live.
- [ ] The item details response shape and the `PATCH`/`DELETE` item routes (section 4), so the details screen can load, favorite, edit and delete items.
- [x] The `GET /api/weather` response shape (section 6). The client weather work can start now.


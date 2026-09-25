# Connecting the client to the server

The Expo app (`client/`) and the NestJS server (`server/`) can't talk to each other yet. The server's only routes are two upload-URL routes, and even those don't match what the app calls. This file lists everything needed to connect them, in the order to do it.

## 1. Basic server setup (blocks everything else)

- [ ] **Load env variables.** Nest doesn't read `.env` files by itself, and the server has no `@nestjs/config` or `dotenv`. So `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_BUCKET_NAME` are currently undefined. Add config loading plus a `server/.env.example`.
- [ ] **Add database access.** `@prisma/client` is installed, but nothing in `src/` uses it. Add a `PrismaService` and `PrismaModule`.
- [ ] **Add the `/api` prefix.** Every app request starts with `/api/...`, but the server's routes don't. Add `app.setGlobalPrefix('api')` in `server/src/main.ts`.
- [ ] **Enable CORS** with `app.enableCors()` in `main.ts`. Only the web build needs it.
- [ ] **Point phones at the server.** Set `EXPO_PUBLIC_API_URL` in `client/.env.local` to the laptop's Wi-Fi IP, e.g. `http://192.168.1.20:3000`. `localhost` on a phone means the phone itself.

## 2. Auth (needed before any real data)

### Server
- [ ] Add `POST /api/auth/signup` and `POST /api/auth/login`. Login accepts an email **or** a phone number, matching the Email/Phone toggle on the login screen.
- [ ] Hash passwords with bcrypt or argon2 into `User.passwordHash`.
- [ ] Issue a JWT with `{ sub: user.id }` using `@nestjs/jwt`, and add an auth guard that sets `req.user` from it.
- [ ] Schema changes to `User`:
  - `displayName` is required, but sign-up only collects `name`. Make it optional or copy `name` into it.
  - `phone` needs `@unique` so a phone-number login finds exactly one user.
  - Add `marketingOptIn Boolean @default(false)` for the sign-up checkbox.
- [ ] Enforce the same rules as the sign-up screen, since client checks can be bypassed (see `src/utils/validation.ts`):
  - Trim and lowercase emails before saving or looking them up.
  - Phone arrives as E.164 (`+13365550123`, US only for now). Store it that way. Login by phone should normalize the typed number the same way.
  - Password: at least 8 characters, with an uppercase letter, a lowercase letter and a number.
  - Return a clear error for "email already taken" (e.g. 409 with a message), so the app can show it under the email field.
- [ ] Later: Apple and Google sign-in, which each need server-side token verification.

### Client
- [ ] Wire `signUpWithPassword` and `loginWithPassword` in `src/services/auth.ts` to the new routes.
- [ ] Store the token with `expo-secure-store` (`npx expo install expo-secure-store`).
- [ ] Make `isSignedIn()` read the stored token. Reading it is async, so `src/app/index.tsx` needs a short loading state before redirecting.
- [ ] Send `Authorization: Bearer <token>` on every API request (`src/services/photos.ts`, `src/services/items.ts`).
- [x] After a successful login, navigate: `router.replace('/closet')` in `src/app/(auth)/login.tsx`. Right now it does nothing on success.
- [ ] Add sign-out (clear the token), e.g. from the Settings tab.

## 3. Body photo upload

The client and server currently disagree on almost every detail:

| | App calls | Server has |
|---|---|---|
| Get an upload URL | `POST /api/photos/body/upload-url` `{ contentType, fileName }` → `{ uploadUrl, key }` | `POST /uploads/body-photo` `{ userId, contentType }` → `{ key, url }` |
| Save it to the user | `POST /api/photos/body` `{ key }` | **missing** |

- [ ] Agree on one route name and one response field name (`uploadUrl` vs `url`), then update whichever side changes.
- [ ] Server: take `userId` from the token, not the request body. Otherwise anyone can upload into another user's folder.
- [ ] Server: build the "save" route. It checks the file exists in S3, then creates a `TryOnPhoto` with `isPrimary: true`.
- [ ] Server: `buildKey` always uses `.jpg`. Derive the extension from `contentType` and reject anything that isn't an image.
- [ ] S3: the bucket's CORS settings must allow `PUT` from the app, or web uploads fail.

## 4. Closet items

Clothing photos live in AWS S3. The client uploads the original photo, and the server cuts the piece out and stores the cutout in S3 as well (`Item.imageKey` for the original, `Item.cutoutKey` for the cutout).

- [ ] Server: build `GET /api/items`, returning the signed-in user's items as `{ id, name, category, imageUrl, isFavorite }` (the client's `ClosetItem` type in `src/services/items.ts`).
- [ ] Server: `imageUrl` should be a signed download URL for `cutoutKey`, falling back to `imageKey` until the cutout is ready (`S3Service.getDownloadUrl` exists). Its 5-minute expiry will break the app's cached images. Use a longer expiry or a CloudFront URL.
- [ ] Category names don't match. The server uses `Top`, `Bottoms`, `Accessory`, `OnePiece`, while the client uses `tops`, `accessories`, `one-piece` and so on. Pick one side to change, or convert in the route.
- [ ] Schema additions to `Item`: `isFavorite Boolean @default(false)` and a `Sets` value in `Category`.
- [ ] Adding items from a photo (the client side is built as `uploadItemPhoto` in `src/services/items.ts`, stubbed until these exist):
  1. `POST /api/items/photo/upload-url { contentType, fileName }` → `{ uploadUrl, key }`, a presigned S3 PUT. `POST /uploads/clothing` covers part of this today.
  2. The app PUTs the image straight to S3.
  3. `POST /api/items/photo { key }` → `{ itemId }`. It saves `imageKey`, cuts the piece out, stores it in S3 as `cutoutKey`, and fills in category, color and fit.
- [ ] Adding items from a link (the client calls `importItemFromLink`, currently a "coming soon" stub): a route that fetches the product page, saves the product image to S3 and returns details for the user to confirm.
- [ ] Client: a "confirm details" screen after adding, where the user checks what Sage filled in.

### Cutout and tagging (server side)

The background is removed on the **server**, not the phone. That gives the same result on iOS, Android and web, works in Expo Go, and can be changed without an app update. The server already has to look at the photo to fill in category, color and fit, and that AI key must stay server-side anyway.

What happens in step 3 above (`POST /api/items/photo { key }`):
1. Check the key belongs to the signed-in user (`users/<sub>/clothing/...`) and that the object exists in S3.
2. Download the original from S3. Resize it (e.g. longest side 1024px) to keep processing fast and cheap.
3. **Cut it out.** Pick one:
   - **Amazon Bedrock, Nova Canvas (recommended to start).** It has a background-removal mode. Call it from NestJS with `@aws-sdk/client-bedrock-runtime`, alongside the existing S3 SDK, so there's no model to host. It costs a few cents per image. Check it's available in your AWS region and that model access is enabled on the account.
   - **Self-hosted rembg.** A free, open-source Python library. It needs a small Python service next to the Node server and a machine with enough memory for the model. If you use a Node background-removal library instead, check its licence (some are AGPL).
4. Save the result as a transparent PNG to S3 (e.g. `users/<sub>/clothing/<uuid>-cutout.png`) and set `Item.cutoutKey`. Note that `S3Service.buildKey` currently always uses `.jpg`.
5. **Tag it.** Send the cutout to an AI vision model to fill in `category`, `type`, `colorHex` (1–3 values), `pattern`, `material`, `fit` and a short `name`. Ask for JSON and validate it against the Prisma enums before saving.
6. Optionally, create the `embedding` for outfit suggestions at the same point.
7. Create the `Item` and return `{ itemId }`.

How it runs:
- [ ] **Start synchronous.** Do all of the above inside the request and reply when it's finished. That takes a few seconds, which the app's "Sage is cutting it out…" overlay already covers.
- [ ] **Later, if it's slow:** reply straight away with the item saved using only `imageKey`, and do steps 3–6 in the background, e.g. with an S3-triggered Lambda or a job queue. The `imageUrl` fallback (cutout if ready, otherwise the original) already handles the gap.
- [ ] If the cutout fails, still save the item with the original photo, rather than making the user retake it.

Possible later extra: on-device cutout on iOS 17+ (Apple's Vision framework) for an instant preview while the server makes the final version. It needs a custom native module and doesn't work in Expo Go.

## 5. Client cleanups

- [x] Comments in `src/services/auth.ts` and `.env.example` say the backend is **Next.js**. It's **NestJS**.

## Suggested order

1. Basic server setup (section 1)
2. Auth, plus navigating after login (section 2)
3. Body photo routes: the smallest real end-to-end test (section 3)
4. Items list (section 4)
5. Add-item flow (section 4): upload first, saving the item with just the original photo
6. Cutout and tagging (section 4): add background removal, then AI tagging

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [x] Fix the "Next.js" comments in `src/services/auth.ts` and `.env.example` to say NestJS.
- [x] Add `router.replace('/closet')` after a successful login in `src/app/(auth)/login.tsx`.
- [x] Install `expo-secure-store` and add a small session module (save, read and clear the token).
- [ ] Move `apiPost` out of `src/services/photos.ts` into a shared `src/services/api.ts` (with `apiGet`) that adds the `Authorization` header automatically. Use it in `photos.ts`, `items.ts` and `auth.ts`.
- [ ] Make `isSignedIn()` async and add a loading state in `src/app/index.tsx`.
- [ ] Add a sign-out button to the Settings tab.
- [x] Move the photo picker to `src/components/photo-picker.ts` with a neutral default file name, so the add-item screen can reuse it.

### Needs a server decision first
- [ ] Auth request and response shapes, including the error for an email that's already taken.
- [ ] Body photo route names and the `uploadUrl`/`url` field name.
- [ ] Category naming for items.
- [ ] The item-photo and link-import routes (section 4), so `uploadItemPhoto` and `importItemFromLink` can go live.


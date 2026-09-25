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
- [ ] Later: Apple and Google sign-in, which each need server-side token verification.

### Client
- [ ] Wire `signUpWithPassword` and `loginWithPassword` in `src/services/auth.ts` to the new routes.
- [ ] Store the token with `expo-secure-store` (`npx expo install expo-secure-store`).
- [ ] Make `isSignedIn()` read the stored token. Reading it is async, so `src/app/index.tsx` needs a short loading state before redirecting.
- [ ] Send `Authorization: Bearer <token>` on every API request (`src/services/photos.ts`, `src/services/items.ts`).
- [ ] After a successful login, navigate: `router.replace('/closet')` in `src/app/(auth)/login.tsx`. Right now it does nothing on success.
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

- [ ] Server: build `GET /api/items`, returning the signed-in user's items as `{ id, name, category, imageUrl, aspectRatio, isFavorite }` (the client's `ClosetItem` type in `src/services/items.ts`).
- [ ] Server: `Item` stores `imageKey`, not a URL, so the route must create a signed download URL (`S3Service.getDownloadUrl` exists). Its 5-minute expiry will break the app's cached images. Use a longer expiry or a CloudFront URL.
- [ ] Category names don't match. The server uses `Top`, `Bottoms`, `Accessory`, `OnePiece`, while the client uses `tops`, `accessories`, `one-piece` and so on. Pick one side to change, or convert in the route.
- [ ] Schema additions to `Item`: `isFavorite Boolean @default(false)`, a `Sets` value in `Category`, and the image shape (`width`/`height` or `aspectRatio`).
- [ ] Adding items:
  - Server: `POST /uploads/clothing` exists for the upload URL, but it needs a "create item" route to save the item after upload.
  - Client: replace the `src/app/add-item.tsx` placeholder with the real flow: pick a photo, then name and category, then upload, then create.

## 5. Client cleanups

- [ ] Comments in `src/services/auth.ts` and `.env.example` say the backend is **Next.js**. It's **NestJS**.

## Suggested order

1. Basic server setup (section 1)
2. Auth, plus navigating after login (section 2)
3. Body photo routes: the smallest real end-to-end test (section 3)
4. Items list (section 4)
5. Add-item flow (section 4)

## Client-only checklist

What the client needs, split by whether it can be done now.

### Can do now
- [ ] Fix the "Next.js" comments in `src/services/auth.ts` and `.env.example` to say NestJS.
- [ ] Add `router.replace('/closet')` after a successful login in `src/app/(auth)/login.tsx`.
- [ ] Install `expo-secure-store` and add a small session module (save, read and clear the token).
- [ ] Move `apiPost` out of `src/services/photos.ts` into a shared `src/services/api.ts` (with `apiGet`) that adds the `Authorization` header automatically. Use it in `photos.ts`, `items.ts` and `auth.ts`.
- [ ] Make `isSignedIn()` async and add a loading state in `src/app/index.tsx`.
- [ ] Add a sign-out button to the Settings tab.
- [ ] Generalize `src/components/onboarding/photo-picker.ts` (its default file name is `body-photo.jpg`) so the add-item flow can reuse it.

### Needs a server decision first
- [ ] Auth request and response shapes, including the error for an email that's already taken.
- [ ] Body photo route names and the `uploadUrl`/`url` field name.
- [ ] Category naming for items.
- [ ] The create-item route, before building the real add-item screen.

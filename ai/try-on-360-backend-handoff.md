# Backend handoff: 360° try-on photos

**From:** Javier (AI / server). **For:** whoever owns the database and `server/src/photos/`.

Try-on is now an 8-frame 360° spin. The user uploads **2** try-on photos, a front and a back, and the server generates the other 6 angles in the background. Each user ends up with **8** `TryOnPhoto` rows, one per angle.

The Gemini side is done: `TryOnService` in `server/src/gemini/try-on/service.ts`. It's written against the schema below, so **try-on fails at runtime until this migration lands**. The server still builds, because Prisma's query types don't catch unknown fields in this project.

Positions are 45° apart, the person turned to their right: **0 = front**, 2 = their left side, **4 = back**, 6 = their right side.

## Change for 8 angles (was 12)
This was 12 frames, 30° apart, with the back at 6. It's 8 now, and the server side is **already done**; nothing to build. What changed:
- **Positions:** 8 frames, 45° apart, back at **4**. The numbers live in `server/src/gemini/try-on/turnaround.ts` (`FRAMES`, `STEP`, `BACK`); `photos.service.ts` imports `BACK` from there, so don't hard-code 4 or 6.
- **`generateAngles`** makes positions 1–7: creates rows 1–3 and 5–7 and updates row 4 (the back).
- **Dressing** (`POST /api/stylist/try-on`) makes all 8 frames in one parallel round instead of the front first, for speed.
- **The test routes** in `server/src/try-on-360/` were removed.
- **No migration:** rows saved under the 12-angle layout (back at 6, angles up to 11) aren't converted, and `needsRetake` doesn't catch them, since they have a row at 4. Anyone with try-on photos from before this change has to upload front and back again; the new upload replaces all their rows and saved try-ons.

## 1. Schema: `TryOnPhoto.position`
```prisma
model TryOnPhoto {
  // ...existing fields
  position Int @default(0) // 0–7: 0 = front, 4 = back

  @@unique([userId, position])
}
```
- **Migration:** first delete any extra rows per user, keeping the newest by `capturedAt`, or the unique index fails. Existing rows become position 0.
- **`isPrimary`:** stays true only on position 0. The Gemini code doesn't read it anymore.
- **`TryOnRender`:** no change. It already has `position` and the unique key `(tryOnPhotoId, itemsHash, position)`.

## 2. Upload: front + back (`photos.dto.ts`, `photos.service.ts`, `photos.controller.ts`)
```
POST /api/photos/body/upload-url { contentType, fileName } -> { uploadUrl, key }   // unchanged, called twice
POST /api/photos/body { frontKey, backKey } -> { photoId }                        // was { key }; photoId is the front
```
- **`SaveBodyPhotoDto`:** `{ frontKey, backKey }`, both with the existing key regex. 400 if they're the same key.
- **Checks:** the same as now, for both keys: in `users/{userId}/body/`, and the upload finished (404 otherwise).
- **Retries:** if a position-0 row with `frontKey` already exists, return it.
- **In one transaction:**
  - Collect the keys of **all** the user's old `TryOnPhoto` rows (all positions) and their `TryOnRender`s.
  - Delete all the old rows **before** creating the new ones (the unique key needs that order). Renders go with them through the cascade.
  - Create position 0 (`frontKey`, `isPrimary: true`) and position 4 (`backKey`).
- **After the transaction:**
  - Delete the old S3 files, as now.
  - Then start the angles **without awaiting**:
    ```ts
    void this.tryOn.generateAngles(userId, front.id);
    ```
    It never throws (it logs its own failures), so nothing else is needed.
- **`photos.module.ts`:** import `GeminiModule` to get `TryOnService`.

What `generateAngles` does, so you know what to expect in the table:
- It makes positions 1–7 and saves them **all at once** in one transaction: it creates rows 1–3 and 5–7, and **updates row 4's `imageKey`**, replacing the uploaded back with one in the front photo's pose. The uploaded back's S3 file is then deleted.
- If a newer upload happened meanwhile, it saves nothing and deletes its files.
- It takes a while (7 Gemini calls in parallel, plus a retry for any that fail).

## 3. `GET /api/photos/body`
Look up `position: 0` instead of `isPrimary`, and add two fields:
```ts
{ photoId, imageUrl, anglesReady: boolean, needsRetake: boolean }
```
- `anglesReady`: the user has **more than 2** rows. `generateAngles` saves all its angles at once, so any extra row means it's finished.
- `needsRetake`: there's no position 4 (the back), so this is an old single-photo user. Try-on returns 404 for them until they upload front and back.

## 4. Stylist try-on types (`stylist.service.ts:169`, `stylist.controller.ts:70`)
`TryOnService.generate` now returns `TryOnResult` (exported from `server/src/gemini/try-on/service.ts`):
```ts
type TryOnResult = {
  imageUrl: string; // frame 0, same as frames[0].imageUrl
  frames: { position: number; angle: number; imageUrl: string | null }[]; // always 8, by position
};
```
- It already reaches the app at runtime, because `StylistService.tryOn` returns it unchanged.
- Change `StylistService.tryOn`'s return type from `{ imageUrl: string }` to `TryOnResult`, and update the route comment.
- The errors are the same, plus a 404 "Retake your try-on photos (front and back)…" for users without a back photo.

## 5. No change needed
- **Account deletion** (`server/src/auth/auth.service.ts:155`) already deletes every `TryOnPhoto` and `TryOnRender` and their files.

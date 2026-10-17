# Frontend handoff: 360° try-on

**From:** Javier (AI / server). **For:** whoever owns `client/`.

Try-on is now a 12-frame 360° spin of the user in the outfit. For that, the user's try-on photos are a **front and a back** instead of one photo. The upload changes depend on backend (`ai/try-on-360-backend-handoff.md`), so wire them once those are in.

Files:
- `client/src/services/photos.ts` (`uploadBodyPhoto`, `confirmBodyPhotoUpload`, `hasBodyPhoto`)
- `client/src/app/(onboarding)/body-photo.tsx`
- `client/src/app/try-on.tsx`
- `client/src/services/stylist.ts`

## 1. Try-on photos: front and back
The user takes **2 photos**: the front, then the back. Not 12; the server makes the other angles.
- For the back photo: same person, same spot and distance, standing naturally, facing away from the camera.
- Upload each one as now (`POST /api/photos/body/upload-url`, then PUT to S3), then confirm **both in one call**:
```
POST /api/photos/body { frontKey, backKey } -> { photoId }   // was { key } -> { photoId }
```
- The confirm returns right away. The other 10 angles are generated **in the background** afterwards, which takes a while.
- A new upload replaces **all** of the user's try-on photos and every saved try-on made from them. If settings has a "change photo" option, warn that saved try-ons will be redone.

## 2. Is it ready? `GET /api/photos/body`
```ts
type BodyPhoto = {
  photoId: string;
  imageUrl: string;      // the front photo
  anglesReady: boolean;  // the other angles are made; the spin will be complete
  needsRetake: boolean;  // old single-photo user: ask them to take front + back
};
```
- 404 still means no try-on photo at all.
- **`needsRetake: true`:** send them to the front + back flow. Try-on returns 404 for them until they do.
- **`anglesReady: false`:** try-on still works, but only frame 0 (the front) is filled in. Wait for `anglesReady`, polling every few seconds, before showing the spin, or show just the front for now.

## 3. The try-on response
`POST /api/stylist/try-on { itemIds }`. The request is the same; the response has the frames now:
```ts
export type TryOnFrame = {
  position: number;        // 0–11; 0 = front, 6 = back
  angle: number;           // position × 30, the person turned to their right
  imageUrl: string | null; // signed JPEG URL, valid 24h; null if that angle isn't ready or failed
};

export type TryOnResult = {
  imageUrl: string;     // frame 0, so the current screen keeps working as is
  frames: TryOnFrame[]; // always 12, sorted by position
};
```
- It returns **all frames at once**. The first try-on of an outfit generates them all, so it's a long wait: show progress and don't time out early. Trying on the same items again returns the saved frames quickly.

## 4. Showing it
- Show `frames` in order as a spinner: dragging steps through positions 0 → 11 → 0. Start on position 0.
- **Skip frames with `imageUrl: null`.** Frame 0 is never null: if it fails, the whole request is an error.
- **Preload all the images** before enabling the spin, or it flickers while each one loads.
- The URLs last 24 hours, so don't cache them longer.

## 5. Errors
Same as before; show `serverMessage` for these.
- **400:** bad item IDs
- **404:** no try-on photo, an old photo that needs retaking (front and back), or an item isn't in the closet
- **422:** the photo couldn't be used
- **503:** AI unavailable, try again

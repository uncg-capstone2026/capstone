# Upload & outfit planning: what changed

**Upload** (`POST /api/items/photo { key }`)
- Returns `{ itemId }` once background removal and AI tagging and embedding are done, whether those steps worked or not. It takes a few seconds.
- If a step fails, the item is still saved, just without a cutout or tags.

**Outfit planning** (`POST /api/stylist/outfit { occasion, date? }`)
- Returns **one** outfit: `{ items: [{ itemId, type, imageUrl }], reason }`.
- An outfit is a top + bottoms, or a one-piece (dress). Shoes, jacket and accessory are optional.
- **Weather isn't used yet.** Nothing is saved.
- 422 = not enough clothes in the closet. The `message` is safe to show.
- `imageUrl` links expire after 5 minutes.

# Server: upload & outfit planning (current state)

What the server does today for these two features. Build the client against this only, and don't build for anything under "Not implemented".

## Upload
`POST /api/items/photo` `{ key: string }` → `{ itemId: string }`
- Responds only after background removal, AI tagging and embedding have finished, **whether or not each succeeded**. The item always exists. If a step failed, it just has no cutout and/or no tags.
- Items whose tagging or embedding failed never show up in outfits.

## Outfit planning
`POST /api/stylist/outfit`
```ts
type StyleOutfitRequest = { occasion: string /* 1–300 chars */; date?: string /* 'YYYY-MM-DD' */ };

type PlannedOutfit = {
  items: { itemId: string; type: string | null; imageUrl: string }[]; // 1–5 items
  reason: string;                                                     // written to the user; show as-is
};
```
- Exactly **one** complete outfit: Top + Bottoms, or a OnePiece (dress). Shoes, outerwear and accessory are optional.
- `type` is the garment type (`'t-shirt'`, `'jeans'`), not the app category.
- `imageUrl` is a signed URL to the cutout (or original), valid for **5 minutes**.
- 422 means not enough matching items; show `serverMessage`. 400 means invalid body. 500 means show a retry.
- Name and category aren't included. Use `GET /api/items/:id` if needed.
- Replace the `styleOutfit` stub in `client/src/services/stylist.ts`.

## Not implemented
- Weather in outfit planning
- Multiple outfits, saving outfits
- Excluding items from suggestions
- New garment types (romper, etc.)
- Try on feature

## Temporary, ignore
`/api/gemini/*` and `GET /api/items/:id/embedding` are test routes that will be removed.

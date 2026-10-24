import {
  CATEGORY_BY_TYPE,
  CLOTHING_TYPES,
  CUTS_BY_CATEGORY,
  FORMALITY_LEVELS,
  PATTERNS,
  SEASONS,
  type Category,
} from '../constants';
import { quoteList } from '../helpers';

// One line per category: its types, then the cuts it may use, e.g.
// '  - Shoes (sneakers, boots, ...): "Low-top", "High-top", ...'.
const CUT_LINES = (Object.keys(CUTS_BY_CATEGORY) as Category[])
  .map((category) => {
    const types = CLOTHING_TYPES.filter((type) => CATEGORY_BY_TYPE[type] === category);
    return `  - ${category} (${types.join(', ')}): ${quoteList(CUTS_BY_CATEGORY[category])}`;
  })
  .join('\n');

export const IMAGE_ATTRIBUTES_PROMPT = `You are analyzing a photo of a single clothing item for a closet
cataloging app. Describe only the garment itself — ignore the
background, hanger, surface, or person wearing it. Identify the
following attributes based only on what is visible in the image:

- name: a short label for the item, 2-5 words (e.g. "Navy crew-neck
  sweater", "Light-wash straight jeans").
- type: exactly one of ${quoteList(CLOTHING_TYPES)}.
- colorHex: the 1-3 main colors of the garment as hex codes
  ("#RRGGBB"), most prominent first. Skip small logos, stitching, or
  hardware; only include a color if it covers a noticeable part of
  the garment.
- pattern: one of ${quoteList(PATTERNS)}, or null if you cannot tell.
- material: your best guess at the fabric/material (e.g. "cotton",
  "denim", "leather", "wool", "polyester"), or null if you cannot
  tell from the image. Do not guess randomly.
- season: the single season this item is best suited for, one of
  ${quoteList(SEASONS)}. Use null if it is suitable year-round or
  unclear.
- formality: the best-fitting level, one of
  ${quoteList(FORMALITY_LEVELS)}.
- cut: the garment's cut, chosen only from the list for its type's
  category below. Always pick one: if none matches exactly or you
  cannot tell, make an educated guess with the closest option.
${CUT_LINES}
- fit: how closely the garment sits on the body, one of:
  - "Fitted": hugs the body closely all over.
  - "Slim": close to the body, with a little room to move.
  - "Regular": the standard cut, neither tight nor loose.
  - "Loose": extra room through the body; drapes away from the body.
  - "Oversized": deliberately sized up for a roomy, slouchy look.
  Always pick one, including for shoes and accessories. Judge it from
  how it sits if it is being worn; otherwise make an educated guess
  from the garment's shape, proportions, and style.

Base your answer only on visual evidence in the photo, except that cut
and fit are always an educated guess when the photo doesn't make them
clear (the user can correct them). Do not assume brand, price, or
condition.`;

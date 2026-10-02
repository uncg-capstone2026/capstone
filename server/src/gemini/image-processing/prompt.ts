import {
  CLOTHING_TYPES,
  FITS,
  FORMALITY_LEVELS,
  PATTERNS,
  SEASONS,
} from '../constants';
import { quoteList } from '../helpers';

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
- fit: one of ${quoteList(FITS)}, only if the photo makes the fit
  clear (e.g. the item is being worn). Otherwise null.

Base your answer only on visual evidence in the photo. Do not assume
brand, price, or condition.`;

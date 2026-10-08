type Rgb = { r: number; g: number; b: number };

// Names shown for picked colors. The nearest one wins, so this only needs to cover the
// colors clothing usually comes in.
const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'Charcoal', hex: '#36454f' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Light gray', hex: '#c8c8c8' },
  { name: 'White', hex: '#f8f8f8' },
  { name: 'Ivory', hex: '#fffff0' },
  { name: 'Cream', hex: '#f3e9d2' },
  { name: 'Beige', hex: '#d9c8a9' },
  { name: 'Tan', hex: '#c19a6b' },
  { name: 'Camel', hex: '#a9784f' },
  { name: 'Brown', hex: '#6f4e37' },
  { name: 'Chocolate', hex: '#3f2a1e' },
  { name: 'Burgundy', hex: '#7b1e2e' },
  { name: 'Red', hex: '#c62828' },
  { name: 'Coral', hex: '#f47c6a' },
  { name: 'Pink', hex: '#f4a6c0' },
  { name: 'Blush', hex: '#e8c4c0' },
  { name: 'Hot pink', hex: '#e0368a' },
  { name: 'Orange', hex: '#ef7d22' },
  { name: 'Rust', hex: '#b7472a' },
  { name: 'Mustard', hex: '#d4a72c' },
  { name: 'Yellow', hex: '#f5d547' },
  { name: 'Olive', hex: '#6b6b2e' },
  { name: 'Khaki', hex: '#b5a77a' },
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Green', hex: '#2e8b57' },
  { name: 'Forest green', hex: '#1f4d2b' },
  { name: 'Teal', hex: '#1f7a7a' },
  { name: 'Light blue', hex: '#a7c7e7' },
  { name: 'Denim', hex: '#4a6a8a' },
  { name: 'Blue', hex: '#2f5fbf' },
  { name: 'Navy', hex: '#1c2541' },
  { name: 'Lavender', hex: '#b9a6d6' },
  { name: 'Purple', hex: '#6a3d9a' },
];

const NAMED_RGB = NAMED_COLORS.map((c) => ({ name: c.name, rgb: hexToRgb(c.hex) }));

export function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

// A light tan card behind white clothing, which would otherwise disappear into the cream cards.
export const WHITE_ITEM_BACKGROUND = '#D2BC9F';

// True when the item's main (first) color is white or near-white (ivory, off-white): every
// channel bright and close together.
export function isMainlyWhite(colorHex: string[] | undefined): boolean {
  const main = colorHex?.[0];
  if (!main) return false;
  const { r, g, b } = hexToRgb(main);
  return Math.min(r, g, b) >= 225 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;
}

// Always "#RRGGBB" in uppercase, which is what the server stores.
export function normalizeHex(hex: string): string {
  return `#${hex.replace('#', '').slice(0, 6).toUpperCase()}`;
}

// The nearest named color. Uses a "redmean" weighted distance, which is closer to how people
// see color differences than plain RGB distance, without the cost of converting to Lab.
export function colorName(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  let best = NAMED_RGB[0];
  let bestDistance = Infinity;
  for (const named of NAMED_RGB) {
    const rMean = (r + named.rgb.r) / 2;
    const dr = r - named.rgb.r;
    const dg = g - named.rgb.g;
    const db = b - named.rgb.b;
    const distance = (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db;
    if (distance < bestDistance) {
      best = named;
      bestDistance = distance;
    }
  }
  return best.name;
}

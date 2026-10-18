type Rgb = { r: number; g: number; b: number };

// Names shown for picked colors. The nearest one wins, so this only needs to cover the
// colors clothing usually comes in.
const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'Charcoal Gray', hex: '#3d4045' },
  { name: 'Dark Gray', hex: '#555555' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Heather Gray', hex: '#a6a6a6' },
  { name: 'Light Gray', hex: '#c8c8c8' },
  { name: 'Silver', hex: '#dcdcdc' },
  { name: 'White', hex: '#f8f8f8' },
  { name: 'Ivory', hex: '#fffff0' },
  { name: 'Cream', hex: '#f3e9d2' },
  { name: 'Beige', hex: '#d9c8a9' },
  { name: 'Taupe', hex: '#8b7d70' },
  { name: 'Tan', hex: '#c19a6b' },
  { name: 'Camel', hex: '#a9784f' },
  { name: 'Brown', hex: '#6f4e37' },
  { name: 'Chocolate', hex: '#3f2a1e' },
  { name: 'Maroon', hex: '#5c1a1b' },
  { name: 'Burgundy', hex: '#7b1e2e' },
  { name: 'Red', hex: '#c62828' },
  { name: 'Coral', hex: '#f47c6a' },
  { name: 'Peach', hex: '#fbc4a0' },
  { name: 'Pink', hex: '#f4a6c0' },
  { name: 'Blush', hex: '#e8c4c0' },
  { name: 'Baby Pink', hex: '#f9cfdc' },
  { name: 'Rose', hex: '#e0718f' },
  { name: 'Dusty Rose', hex: '#c48793' },
  { name: 'Mauve', hex: '#a87896' },
  { name: 'Hot Pink', hex: '#e0368a' },
  { name: 'Fuchsia', hex: '#b8197a' },
  { name: 'Orange', hex: '#ef7d22' },
  { name: 'Rust', hex: '#b7472a' },
  { name: 'Terracotta', hex: '#c4623f' },
  { name: 'Burnt Orange', hex: '#cc5500' },
  { name: 'Mustard', hex: '#c99a1f' },
  { name: 'Gold', hex: '#e3bc3a' },
  { name: 'Yellow', hex: '#f5d547' },
  { name: 'Butter Yellow', hex: '#f6e49a' },
  { name: 'Olive', hex: '#6b6b2e' },
  { name: 'Army Green', hex: '#4b5320' },
  { name: 'Khaki', hex: '#b5a77a' },
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Pistachio', hex: '#b5d39a' },
  { name: 'Mint', hex: '#a8e6cf' },
  { name: 'Green', hex: '#2e8b57' },
  { name: 'Kelly Green', hex: '#3fa535' },
  { name: 'Lime', hex: '#a8d93a' },
  { name: 'Forest Green', hex: '#1f4d2b' },
  { name: 'Teal', hex: '#1f7a7a' },
  { name: 'Turquoise', hex: '#30c5c0' },
  { name: 'Light Blue', hex: '#a7c7e7' },
  // Jeans, lightest to darkest. Faded black jeans come out as Charcoal Gray, and the darkest
  // raw denim as Navy.
  { name: 'Ice Blue', hex: '#c3d3e3' },
  { name: 'Pale Blue', hex: '#abbdd2' },
  { name: 'Washed Blue', hex: '#8098b6' },
  { name: 'Steel Blue', hex: '#5e7896' },
  { name: 'Medium Blue', hex: '#4a6b9e' },
  { name: 'Graphite Blue', hex: '#3a4b66' },
  { name: 'Deep Blue', hex: '#263b62' },
  { name: 'Blue', hex: '#2f5fbf' },
  { name: 'Royal Blue', hex: '#1f45c8' },
  { name: 'Navy', hex: '#1c2541' },
  { name: 'Lavender', hex: '#b9a6d6' },
  { name: 'Periwinkle', hex: '#8c9fd9' },
  { name: 'Purple', hex: '#6a3d9a' },
  { name: 'Violet', hex: '#7f4fc9' },
  { name: 'Plum', hex: '#5e2750' },
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

import sharp from 'sharp';

// GET /api/items/:id/color-grid -> what the app's color dropper reads from.
// pixels is row-major (left to right, top to bottom), width * height long.
// Each entry is "#RRGGBB", or null where the pixel is mostly transparent
// (the background removed by the cutout), so the dropper can ignore it.
export type ColorGrid = {
  width: number;
  height: number;
  pixels: (string | null)[];
};

// Longest side of the grid. The app loads it once and reads colors locally,
// so it only needs to be detailed enough to pick a color by tapping.
const GRID_SIZE = 64;

// Pixels with alpha below this (out of 255) count as transparent: below 50%.
const MIN_ALPHA = 128;

export async function buildColorGrid(image: Buffer): Promise<ColorGrid> {
  const { data, info } = await sharp(image)
    .rotate() // respect phone photo orientation (EXIF)
    .resize(GRID_SIZE, GRID_SIZE, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha() // always 4 channels (RGBA), even for JPEGs
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: (string | null)[] = new Array(info.width * info.height);
  for (let i = 0; i < pixels.length; i++) {
    const o = i * 4;
    pixels[i] = data[o + 3] < MIN_ALPHA ? null : `#${hex(data[o])}${hex(data[o + 1])}${hex(data[o + 2])}`;
  }
  return { width: info.width, height: info.height, pixels };
}

// 0-255 -> two uppercase hex digits, matching how colorHex is stored.
const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
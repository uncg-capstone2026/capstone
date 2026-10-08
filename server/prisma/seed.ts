import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import type { Category, Fit } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { GeminiHelpers } from '../src/gemini/helpers';
import { ImageProcessingService } from '../src/gemini/image-processing/service';
import { dayToDate } from '../src/outfits/calendar-day';
import { OutfitsService } from '../src/outfits/outfits.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/s3/s3.service';

// Fills one test account with a tagged closet, outfits, collections and
// calendar days, for testing the app on a device.
//
// Run from server/:   npx ts-node prisma/seed.ts
//
// Every run WIPES and rebuilds this one account's items, outfits, collections,
// calendar days and feedback, so it can be rerun any time. No other account is
// touched. It writes to whatever DATABASE_URL and S3 bucket are in .env.
const SEED_EMAIL = 'seed.tester@example.com';
const SEED_PASSWORD = 'TestPass123!';
const SEED_NAME = 'Seed Tester';

// ---- The closet ----

type SeedItem = {
  key: string; // used below to build outfits
  name: string;
  category: Category;
  type: string; // must be in CLOTHING_TYPES (gemini/constants.ts) for the Stylist search
  colorHex: string[];
  pattern: string;
  material: string;
  season: string;
  formality: string;
  fit: Fit | null;
  shape: keyof typeof SHAPES;
};

const ITEMS: SeedItem[] = [
  { key: 'tee', name: 'White crew tee', category: 'Top', type: 't-shirt', colorHex: ['#F5F5F5'], pattern: 'solid', material: 'cotton', season: 'summer', formality: 'casual', fit: 'Regular', shape: 'teeShirt' },
  { key: 'sweater', name: 'Navy wool sweater', category: 'Top', type: 'sweater', colorHex: ['#1F3A5F'], pattern: 'solid', material: 'wool', season: 'winter', formality: 'smart-casual', fit: 'Regular', shape: 'longSleeve' },
  { key: 'hoodie', name: 'Grey hoodie', category: 'Top', type: 'hoodie', colorHex: ['#8A8D91'], pattern: 'solid', material: 'cotton', season: 'fall', formality: 'casual', fit: 'Oversized', shape: 'longSleeve' },
  { key: 'flannel', name: 'Red plaid shirt', category: 'Top', type: 'button-up-shirt', colorHex: ['#A23B3B', '#2B2B2B'], pattern: 'plaid', material: 'flannel', season: 'fall', formality: 'casual', fit: 'Regular', shape: 'longSleeve' },
  { key: 'jeans', name: 'Blue slim jeans', category: 'Bottoms', type: 'jeans', colorHex: ['#3B5B8C'], pattern: 'solid', material: 'denim', season: 'fall', formality: 'casual', fit: 'Slim', shape: 'pants' },
  { key: 'slacks', name: 'Black dress pants', category: 'Bottoms', type: 'dress-pants', colorHex: ['#2B2B2B'], pattern: 'solid', material: 'wool', season: 'fall', formality: 'business-casual', fit: 'Fitted', shape: 'pants' },
  { key: 'shorts', name: 'Khaki shorts', category: 'Bottoms', type: 'shorts', colorHex: ['#C3B091'], pattern: 'solid', material: 'cotton', season: 'summer', formality: 'casual', fit: 'Loose', shape: 'shorts' },
  { key: 'coat', name: 'Camel coat', category: 'Outerwear', type: 'coat', colorHex: ['#C19A6B'], pattern: 'solid', material: 'wool', season: 'winter', formality: 'smart-casual', fit: 'Regular', shape: 'coat' },
  { key: 'dress', name: 'Green linen dress', category: 'OnePiece', type: 'dress', colorHex: ['#4F7942'], pattern: 'solid', material: 'linen', season: 'spring', formality: 'smart-casual', fit: 'Loose', shape: 'dress' },
  { key: 'sneakers', name: 'White sneakers', category: 'Shoes', type: 'sneakers', colorHex: ['#FAFAFA'], pattern: 'solid', material: 'leather', season: 'spring', formality: 'casual', fit: null, shape: 'sneaker' },
  { key: 'boots', name: 'Brown leather boots', category: 'Shoes', type: 'boots', colorHex: ['#6B4423'], pattern: 'solid', material: 'leather', season: 'fall', formality: 'smart-casual', fit: null, shape: 'boot' },
  { key: 'beanie', name: 'Black beanie', category: 'Accessory', type: 'hat', colorHex: ['#2B2B2B'], pattern: 'solid', material: 'knit', season: 'winter', formality: 'casual', fit: null, shape: 'hat' },
];

// ---- Outfits, calendar days and collections ----

type SeedOutfit = {
  name: string;
  items: string[]; // ITEMS keys
  isFavorite?: boolean;
  days?: { offset: number; eventName: string | null }[]; // days from today: negative = past
};

const OUTFITS: SeedOutfit[] = [
  { name: 'Casual Friday', items: ['tee', 'jeans', 'sneakers'], isFavorite: true, days: [{ offset: -6, eventName: 'Class' }, { offset: 2, eventName: 'Coffee with friends' }] },
  { name: 'Office ready', items: ['sweater', 'slacks', 'boots', 'coat'], days: [{ offset: -3, eventName: 'Team meeting' }, { offset: 5, eventName: 'Presentation' }] },
  { name: 'Weekend hoodie', items: ['hoodie', 'jeans', 'sneakers', 'beanie'], days: [{ offset: -1, eventName: 'Errands' }] },
  { name: 'Garden party', items: ['dress', 'sneakers'], isFavorite: true, days: [{ offset: 10, eventName: 'Garden party' }] },
  { name: 'Fall layers', items: ['flannel', 'jeans', 'boots', 'coat'] },
  { name: 'Beach day', items: ['tee', 'shorts', 'sneakers'], days: [{ offset: -8, eventName: null }] },
];

const COLLECTIONS: { name: string; outfits: string[] }[] = [
  { name: 'Work', outfits: ['Office ready', 'Fall layers'] },
  { name: 'Weekend', outfits: ['Weekend hoodie', 'Garden party'] },
  { name: 'Empty test', outfits: [] }, // for testing the empty-collection screen
];

// ---- Garment drawings (flat silhouettes on a transparent background) ----

const SHAPES = {
  teeShirt: 'M120 90 L165 65 Q200 95 235 65 L280 90 L345 150 L305 185 L280 160 L280 345 L120 345 L120 160 L95 185 L55 150 Z',
  longSleeve: 'M120 90 L165 65 Q200 95 235 65 L280 90 L335 310 L297 320 L280 170 L280 345 L120 345 L120 170 L103 320 L65 310 Z',
  pants: 'M128 60 L272 60 L292 345 L216 345 L200 150 L184 345 L108 345 Z',
  shorts: 'M118 120 L282 120 L298 265 L216 265 L200 190 L184 265 L102 265 Z',
  coat: 'M140 50 L172 40 Q200 70 228 40 L260 50 L322 120 L332 335 L292 340 L282 175 L288 365 L112 365 L118 175 L108 340 L68 335 L78 120 Z',
  dress: 'M160 50 Q200 82 240 50 L252 140 L314 355 L86 355 L148 140 Z',
  sneaker: 'M70 225 L175 225 Q205 258 258 268 L330 280 Q348 300 332 322 L70 322 Z',
  boot: 'M120 70 L205 70 L205 228 Q245 248 302 258 Q334 280 322 322 L120 322 Z',
  hat: 'M108 262 Q108 118 200 108 Q292 118 292 262 Z',
};

function drawGarment(shape: keyof typeof SHAPES, colors: string[]): Promise<Buffer> {
  // A second color (e.g. plaid) becomes stripes across the garment.
  const fill = colors.length > 1 ? 'url(#stripes)' : colors[0];
  const pattern = colors.length > 1
    ? `<defs><pattern id="stripes" width="40" height="40" patternUnits="userSpaceOnUse">
         <rect width="40" height="40" fill="${colors[0]}"/>
         <rect width="40" height="10" fill="${colors[1]}" opacity="0.6"/>
         <rect width="10" height="40" fill="${colors[1]}" opacity="0.6"/></pattern></defs>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 400 400">${pattern}
    <path d="${SHAPES[shape]}" fill="${fill}" stroke="#00000040" stroke-width="4" stroke-linejoin="round"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ---- Run ----

async function main() {
  const prisma = new PrismaClient();
  const s3 = new S3Service();
  const outfitsService = new OutfitsService(prisma as unknown as PrismaService, s3);
  const imageProcessing = makeImageProcessing();

  try {
    // 1. The account: created once, and its password reset every run.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
    const user = await prisma.user.upsert({
      where: { email: SEED_EMAIL },
      update: { passwordHash },
      create: { email: SEED_EMAIL, name: SEED_NAME, displayName: SEED_NAME, passwordHash, timeZone: 'America/New_York' },
    });
    console.log(`Seeding ${SEED_EMAIL} (${user.id})`);

    // 2. Wipe this account's old data. Cascades remove outfit pieces, calendar
    // days and their notifications, and collection entries.
    const oldItems = await prisma.item.findMany({ where: { userId: user.id }, select: { imageKey: true, cutoutKey: true } });
    await prisma.collection.deleteMany({ where: { userId: user.id } });
    await prisma.outfit.deleteMany({ where: { userId: user.id } });
    await prisma.styleFeedback.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.item.deleteMany({ where: { userId: user.id } });
    const oldKeys = new Set(oldItems.flatMap((i) => [i.imageKey, i.cutoutKey]).filter((k): k is string => !!k));
    for (const key of oldKeys) {
      await s3.deleteObject(key).catch(() => undefined); // a leftover file is harmless
    }
    console.log(`  cleared ${oldItems.length} old item(s)`);

    // 3. Items: draw, upload, save with tags, then embed for the Stylist.
    const itemIds = new Map<string, string>();
    let embedded = 0;
    for (const seed of ITEMS) {
      const png = await drawGarment(seed.shape, seed.colorHex);
      const key = s3.buildKey(user.id, 'clothing', 'png');
      await s3.putObject(key, png, 'image/png');

      const item = await prisma.item.create({
        data: {
          userId: user.id,
          name: seed.name,
          category: seed.category,
          type: seed.type,
          colorHex: seed.colorHex,
          pattern: seed.pattern,
          material: seed.material,
          season: seed.season,
          formality: seed.formality,
          fit: seed.fit,
          imageKey: key,
          cutoutKey: key, // the drawing already has a transparent background
        },
      });
      itemIds.set(seed.key, item.id);

      if (imageProcessing) {
        try {
          const embedding = await imageProcessing.embedImage(png, 'image/png');
          const vector = `[${embedding.join(',')}]`;
          await prisma.$executeRaw`UPDATE "Item" SET embedding = ${vector}::vector WHERE id = ${item.id}`;
          embedded++;
        } catch (err) {
          console.warn(`  no embedding for ${seed.name}: ${(err as Error).message}`);
        }
      }
    }
    console.log(`  ${ITEMS.length} items (${embedded} with embeddings)`);

    // 4. Outfits, built the same way the app builds them (slots and layering).
    const outfitIds = new Map<string, string>();
    let days = 0;
    for (const seed of OUTFITS) {
      const ids = seed.items.map((k) => itemIds.get(k)!);
      const { id } = await outfitsService.create(user.id, { name: seed.name, itemIds: ids });
      if (seed.isFavorite) await prisma.outfit.update({ where: { id }, data: { isFavorite: true } });
      outfitIds.set(seed.name, id);

      for (const day of seed.days ?? []) {
        await prisma.calendarEntry.create({
          data: { outfitId: id, date: dayToDate(dayFromToday(day.offset)), eventName: day.eventName },
        });
        days++;
      }
    }
    console.log(`  ${OUTFITS.length} outfits, ${days} calendar days`);

    // 5. Collections, oldest first so "newest first" matches this list's order reversed.
    for (const [i, seed] of COLLECTIONS.entries()) {
      const collection = await prisma.collection.create({
        data: { userId: user.id, name: seed.name, createdAt: minutesAgo(COLLECTIONS.length - i) },
      });
      for (const [j, outfitName] of seed.outfits.entries()) {
        await prisma.collectionOutfit.create({
          data: { collectionId: collection.id, outfitId: outfitIds.get(outfitName)!, addedAt: minutesAgo(seed.outfits.length - j) },
        });
      }
    }
    console.log(`  ${COLLECTIONS.length} collections`);

    console.log(`Done. Log in as ${SEED_EMAIL} / ${SEED_PASSWORD}.`);
    console.log('Past calendar days are counted as worn by the hourly job (or when the server next starts).');
  } finally {
    await prisma.$disconnect();
  }
}

// Gemini for embeddings, or null (with a warning) if there's no API key.
function makeImageProcessing(): ImageProcessingService | null {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is not set: items will have no embeddings, so the Stylist will skip them.');
    return null;
  }
  return new ImageProcessingService(new GeminiHelpers());
}

// 'YYYY-MM-DD' for today plus offset days, in the seed account's time zone.
function dayFromToday(offset: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); // YYYY-MM-DD
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
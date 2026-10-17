import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type TryOnRender } from '@prisma/client';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { AI_LOG_CONTEXT } from '../../logger.config';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { GeminiHelpers, mimeTypeForKey, seconds } from '../helpers';
import { stylingNotes } from './styling';
import { BACK, baseParts, dressParts, FRAMES, generateFrame, type Image, OTHERS, runRound, STEP } from './turnaround';

const NO_BODY_PHOTO = "You haven't uploaded a try-on photo yet.";
const RETAKE = 'Retake your try-on photos (front and back) to use try-on.';
const ITEMS_MISSING = 'Some of these items are no longer in your closet.';

// Aspect ratios the image model can output, as width / height. The output
// uses the one closest to the user's photo, so its framing is kept.
const ASPECT_RATIOS: [string, number][] = [
  ['1:1', 1],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['4:5', 4 / 5],
  ['5:4', 5 / 4],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
];

export type TryOnItem = {
  name: string;
  category: string | null;
  type: string | null;
  fit: string | null;
  formality: string | null; // used by the styling rules (styling.ts)
  image: Buffer;
  mimeType: string;
};

export type TryOnFrame = {
  position: number; // 0–11; 0 is the front, 6 the back
  angle: number; // position × 30, turned to the person's right
  imageUrl: string | null; // signed, 24 hours; null when the angle isn't ready or failed
};

// imageUrl is frame 0, for the app until it shows the spin.
export type TryOnResult = { imageUrl: string; frames: TryOnFrame[] };

// One of the user's try-on photos (TryOnPhoto): the front and back they
// uploaded, then the other angles generated from them.
type AnglePhoto = { id: string; position: number; imageKey: string };

// The unique key of a saved image: one per photo, set of items and angle.
type RenderKey = { tryOnPhotoId: string; itemsHash: string; position: number };

// Identifies a set of items whatever order they're in: the same items always
// give the same hash. Used to find an outfit's saved try-on image.
export function itemsHash(itemIds: string[]): string
{
  const ids = [...new Set(itemIds)].sort();
  return createHash('sha256').update(ids.join(',')).digest('hex');
}

// Try-on: the user wearing the outfit on screen from 12 angles (see
// turnaround.ts). The user uploads a front and a back photo; generateAngles
// makes the other angles from them once, in the background. Each dressed
// frame is saved as a TryOnRender, so trying on the same items again reuses it.
@Injectable()
export class TryOnService {
  private readonly logger = new Logger(TryOnService.name);
  // Summaries go to the terminal and logs/ai/.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly helpers: GeminiHelpers,
  )
  {}

  // All 12 frames, with signed URLs: the saved ones when these items were
  // already tried on, the rest generated and saved for next time. 404 when
  // there's no try-on photo, only an old front one (no back), or an item isn't
  // in the user's closet; 422 when Gemini declines frame 0. Any other frame
  // that fails comes back with imageUrl null.
  async generate(userId: string, itemIds: string[]): Promise<TryOnResult>
  {
    const photos: AnglePhoto[] = await this.prisma.tryOnPhoto.findMany({
      where: { userId },
      select: { id: true, position: true, imageKey: true },
    });
    const front = photos.find((photo) => photo.position === 0);
    if (!front) throw new NotFoundException({ message: NO_BODY_PHOTO });
    if (!photos.some((photo) => photo.position === BACK)) throw new NotFoundException({ message: RETAKE });

    // Checked before looking for saved frames, so a deleted item is still a 404.
    const ids = [...new Set(itemIds)].sort();
    const owned = await this.prisma.item.count({ where: { id: { in: ids }, userId } });
    if (owned !== ids.length) throw new NotFoundException({ message: ITEMS_MISSING });

    // generateAngles saves the other angles all at once. Until then there's
    // only the front and the uploaded back, so just the front is dressed.
    const angles = photos.length > 2 ? photos : [front];
    const hash = itemsHash(ids);
    const renders = await this.prisma.tryOnRender.findMany({
      where: { tryOnPhotoId: { in: angles.map((angle) => angle.id) }, itemsHash: hash },
    });
    const saved = new Map(renders.map((render) => [render.position, render]));
    // position -> the dressed frame's S3 key
    const keys = new Map(renders.filter((render) => !render.invalidatedAt).map((render) => [render.position, render.imageKey]));

    const missing = angles.filter((angle) => !keys.has(angle.position));
    if (missing.length > 0) {
      await this.dress(userId, itemIds, { ids, hash, front, missing, saved, keys });
    } else {
      this.aiLogger.log({ message: 'try-on reused', items: ids.length, frames: keys.size });
    }

    const frames = await Promise.all(Array.from({ length: FRAMES }, async (_, position) => {
      const key = keys.get(position);
      return { position, angle: position * STEP, imageUrl: key ? await this.s3.getDownloadUrl(key) : null };
    }));
    return { imageUrl: frames[0].imageUrl!, frames };
  }

  // After a new front + back upload: makes the other angles of the user in
  // their own clothes, all in the front photo's pose, and saves them as
  // TryOnPhotos. The back is remade too, so it lines up with the front, and
  // replaces the uploaded one. Called without waiting, so it never throws;
  // failures are logged.
  async generateAngles(userId: string, frontPhotoId: string): Promise<void>
  {
    try {
      await this.makeAngles(userId, frontPhotoId);
    } catch (err) {
      this.logger.error(`Try-on angles for ${userId} failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ---- Helpers ----

  // Generates the frames in `missing` and saves each one, adding its key to
  // `keys`. Frame 0 first (unless it's saved), since every other frame is made
  // from it; it failing fails the request. Any other failed frame is skipped.
  private async dress(
    userId: string,
    itemIds: string[],
    { ids, hash, front, missing, saved, keys }: {
      ids: string[];
      hash: string;
      front: AnglePhoto;
      missing: AnglePhoto[];
      saved: Map<number, TryOnRender>;
      keys: Map<number, string>;
    },
  ): Promise<void>
  {
    const started = Date.now();
    const items = await this.loadItems(userId, itemIds);
    const notes = stylingNotes(items);
    const frontPhoto = await this.loadImage(front.imageKey);
    const aspectRatio = closestAspectRatio(await sharp(frontPhoto.image).metadata());

    const store = async (angle: AnglePhoto, frame: Image) => {
      const key = this.s3.buildKey(userId, 'tryon', 'jpg');
      await this.s3.putObject(key, frame.image, 'image/jpeg');
      const renderKey: RenderKey = { tryOnPhotoId: angle.id, itemsHash: hash, position: angle.position };
      keys.set(angle.position, await this.save(userId, renderKey, ids, key, saved.get(angle.position) ?? null));
    };

    let dressedFront: Image;
    if (keys.has(0)) {
      dressedFront = { image: await this.s3.getObjectBuffer(keys.get(0)!), mimeType: 'image/jpeg' };
    } else {
      dressedFront = await generateFrame(this.helpers, this.aiLogger, {
        label: 'try-on', position: 0, round: 1, aspectRatio, parts: dressParts(0, frontPhoto, undefined, items, notes),
      });
      await store(front, dressedFront);
    }

    const others = new Map(missing.filter((angle) => angle.position !== 0).map((angle) => [angle.position, angle]));
    const { failed } = await runRound([...others.keys()], async (position) => {
      const angle = others.get(position)!;
      const base = await this.loadImage(angle.imageKey);
      const frame = await generateFrame(this.helpers, this.aiLogger, {
        label: 'try-on',
        position,
        round: 2,
        aspectRatio,
        parts: dressParts(position, base, dressedFront, items, notes),
        reference: dressedFront,
      });
      await store(angle, frame);
    });

    const durationMs = Date.now() - started;
    this.aiLogger.log({
      message: 'try-on 360',
      items: ids.length,
      generated: missing.length - failed.size,
      failed: [...failed.keys()],
      durationMs,
      seconds: seconds(durationMs),
    });
  }

  // generateAngles: one round of the 11 other angles, each from the front
  // and back photos, then a second try for any that failed. They're saved
  // all at once, so a try-on never sees half of them.
  private async makeAngles(userId: string, frontPhotoId: string): Promise<void>
  {
    const started = Date.now();
    const photos: AnglePhoto[] = await this.prisma.tryOnPhoto.findMany({
      where: { userId, position: { in: [0, BACK] } },
      select: { id: true, position: true, imageKey: true },
    });
    const front = photos.find((photo) => photo.position === 0);
    const back = photos.find((photo) => photo.position === BACK);
    // Already replaced by a newer upload.
    if (!front || front.id !== frontPhotoId || !back) return;

    const [frontPhoto, backPhoto] = await Promise.all([this.loadImage(front.imageKey), this.loadImage(back.imageKey)]);
    const aspectRatio = closestAspectRatio(await sharp(frontPhoto.image).metadata());

    const made = new Map<number, Image>();
    for (const round of [1, 2]) {
      const todo = OTHERS.filter((position) => !made.has(position));
      if (todo.length === 0) break;
      const { done } = await runRound(todo, (position) => generateFrame(this.helpers, this.aiLogger, {
        label: 'try-on-angles',
        position,
        round,
        aspectRatio,
        parts: baseParts(position, frontPhoto, backPhoto),
        reference: frontPhoto,
      }));
      done.forEach((frame, position) => made.set(position, frame));
    }
    if (made.size === 0) throw new Error('No angles could be generated');

    const keys = new Map(await Promise.all([...made].map(async ([position, frame]) => {
      const key = this.s3.buildKey(userId, 'body', 'jpg');
      await this.s3.putObject(key, frame.image, 'image/jpeg');
      return [position, key] as const;
    })));

    const newBack = keys.get(BACK);
    let saved = false;
    try {
      saved = await this.prisma.$transaction(async (tx) => {
        if (!(await tx.tryOnPhoto.findUnique({ where: { id: front.id }, select: { id: true } }))) return false;
        if (newBack) {
          // Only while it's still the uploaded back.
          const { count } = await tx.tryOnPhoto.updateMany({
            where: { id: back.id, imageKey: back.imageKey },
            data: { imageKey: newBack },
          });
          if (count === 0) return false;
        }
        await tx.tryOnPhoto.createMany({
          data: [...keys].filter(([position]) => position !== BACK).map(([position, imageKey]) => ({ userId, position, imageKey })),
        });
        return true;
      });
    } catch (err) {
      // P2002: a newer upload's angles were saved first.
      const lost = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!lost) {
        await this.deleteFiles(userId, [...keys.values()]);
        throw err;
      }
    }

    if (!saved) {
      this.logger.warn(`Try-on angles for ${userId} not saved, the photos were replaced`);
      await this.deleteFiles(userId, [...keys.values()]);
      return;
    }
    if (newBack) await this.deleteFiles(userId, [back.imageKey]);

    const durationMs = Date.now() - started;
    this.aiLogger.log({
      message: 'try-on angles',
      made: made.size,
      failed: OTHERS.filter((position) => !made.has(position)),
      durationMs,
      seconds: seconds(durationMs),
    });
  }

  // Saves the uploaded image (key) as the TryOnRender for renderKey and returns
  // the key to serve. An invalidated row (`previous`) is replaced in place,
  // since the unique key allows only one. If an identical request saved its
  // image first, that one is kept and this file is deleted.
  private async save(
    userId: string,
    renderKey: RenderKey,
    ids: string[],
    key: string,
    previous: TryOnRender | null,
  ): Promise<string>
  {
    if (previous) {
      // Only while it still has the old image, in case another request replaced it first.
      const { count } = await this.prisma.tryOnRender.updateMany({
        where: { id: previous.id, imageKey: previous.imageKey },
        data: { imageKey: key, invalidatedAt: null, createdAt: new Date() },
      });
      if (count > 0) {
        await this.deleteFiles(userId, [previous.imageKey]);
        return key;
      }
    } else {
      try {
        await this.prisma.tryOnRender.create({ data: { userId, ...renderKey, itemIds: ids, imageKey: key } });
        return key;
      } catch (err) {
        // P2002: an identical request saved first. P2003: the try-on photo
        // was replaced while this one was being made.
        const lost = err instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003'].includes(err.code);
        if (!lost) throw err;
      }
    }

    const winner = await this.prisma.tryOnRender.findUnique({
      where: { tryOnPhotoId_itemsHash_position: renderKey },
    });
    if (!winner) {
      // The photo was replaced: still show this image, but it isn't saved.
      this.logger.warn(`Try-on for ${userId} not saved, its try-on photo was replaced: ${key}`);
      return key;
    }
    await this.deleteFiles(userId, [key]);
    return winner.imageKey;
  }

  // A failed S3 delete only leaves an unused file, so it's logged, not thrown.
  private async deleteFiles(userId: string, keys: string[]): Promise<void>
  {
    const failed = await this.s3.deleteObjects(keys);
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} old try-on files for ${userId} weren't deleted: ${failed.join(', ')}`);
    }
  }

  // Every item with its photo (the cutout when there is one, so Gemini sees
  // only the garment). Unlike outfit planning, a missing item is a 404 rather
  // than skipped, or the photo would quietly leave out a piece. Public so the
  // test routes (try-on-360) can use it.
  async loadItems(userId: string, itemIds: string[]): Promise<TryOnItem[]>
  {
    const ids = [...new Set(itemIds)];
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, name: true, category: true, type: true, fit: true, formality: true, imageKey: true, cutoutKey: true },
    });
    if (items.length !== ids.length) throw new NotFoundException({ message: ITEMS_MISSING });

    // In the order the app sent them.
    const position = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    return Promise.all(
      items.map(async (item) => ({
        name: item.name,
        category: item.category,
        type: item.type,
        fit: item.fit,
        formality: item.formality,
        ...(await this.loadImage(item.cutoutKey ?? item.imageKey)),
      })),
    );
  }

  // A photo from S3, as PNG or JPEG. Anything else (e.g. a WebP body photo)
  // is converted to JPEG first, since Gemini isn't sent other types.
  private async loadImage(key: string): Promise<{ image: Buffer; mimeType: string }>
  {
    const image = await this.s3.getObjectBuffer(key);
    const mimeType = mimeTypeForKey(key);
    if (mimeType) return { image, mimeType };
    const jpeg = await sharp(image).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    return { image: jpeg, mimeType: 'image/jpeg' };
  }
}

// e.g. "name: Navy crew-neck sweater | category: Top | type: sweater | fit: Relaxed".
// Empty fields are left out.
export function describeItem(item: TryOnItem): string
{
  const fields: [string, string | null][] = [
    ['name', item.name],
    ['category', item.category],
    ['type', item.type],
    ['fit', item.fit],
  ];
  return fields
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join(' | ');
}

// The supported aspect ratio closest to the photo's. EXIF orientation 5-8
// means the photo is shown rotated 90°, so width and height swap.
export function closestAspectRatio(meta: sharp.Metadata): string
{
  if (!meta.width || !meta.height) return '3:4';
  const rotated = (meta.orientation ?? 1) >= 5;
  const ratio = rotated ? meta.height / meta.width : meta.width / meta.height;
  let best = ASPECT_RATIOS[0];
  for (const candidate of ASPECT_RATIOS) {
    if (Math.abs(Math.log(candidate[1] / ratio)) < Math.abs(Math.log(best[1] / ratio))) best = candidate;
  }
  return best[0];
}

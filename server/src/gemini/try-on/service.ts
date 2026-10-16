import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Part } from '@google/genai';
import { Prisma, type TryOnRender } from '@prisma/client';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { AI_LOG_CONTEXT } from '../../logger.config';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { IMAGE_MODEL } from '../constants';
import { GeminiHelpers, mimeTypeForKey, seconds, tokenCounts } from '../helpers';
import { OUTFIT_HEADER, TRY_ON_PROMPT, USER_PHOTO_LABEL } from './prompt';

const NO_BODY_PHOTO = "You haven't uploaded a try-on photo yet.";
const ITEMS_MISSING = 'Some of these items are no longer in your closet.';
const DECLINED = "StyleMe couldn't create a try-on with this photo.";

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

type TryOnItem = {
  name: string;
  category: string | null;
  type: string | null;
  fit: string | null;
  image: Buffer;
  mimeType: string;
};

// The unique key of a saved image: one per photo, set of items and angle.
type RenderKey = { tryOnPhotoId: string; itemsHash: string; position: number };

// Identifies a set of items whatever order they're in: the same items always
// give the same hash. Used to find an outfit's saved try-on image.
export function itemsHash(itemIds: string[]): string
{
  const ids = [...new Set(itemIds)].sort();
  return createHash('sha256').update(ids.join(',')).digest('hex');
}

// Try-on: a photo of the user wearing the outfit on screen, made from their
// primary try-on photo and the items' photos. Each image is saved as a
// TryOnRender, so trying on the same items with the same photo again reuses it.
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

  // Returns a signed URL to the photo: the saved one when these items were
  // already tried on with this photo, otherwise a new one from Gemini, saved
  // for next time. 404 when there's no try-on photo or an item isn't in the
  // user's closet; 422 when Gemini declines (e.g. the photo doesn't show one person).
  async generate(userId: string, itemIds: string[]): Promise<{ imageUrl: string }>
  {
    const bodyPhoto = await this.prisma.tryOnPhoto.findFirst({
      where: { userId, isPrimary: true },
      orderBy: { capturedAt: 'desc' }, // newest, just in case there were ever two
      select: { id: true, imageKey: true },
    });
    if (!bodyPhoto) throw new NotFoundException({ message: NO_BODY_PHOTO });

    // Checked before looking for a saved image, so a deleted item is still a 404.
    const ids = [...new Set(itemIds)].sort();
    const owned = await this.prisma.item.count({ where: { id: { in: ids }, userId } });
    if (owned !== ids.length) throw new NotFoundException({ message: ITEMS_MISSING });

    // Only the first angle for now.
    const renderKey: RenderKey = { tryOnPhotoId: bodyPhoto.id, itemsHash: itemsHash(ids), position: 0 };
    const saved = await this.prisma.tryOnRender.findUnique({
      where: { tryOnPhotoId_itemsHash_position: renderKey },
    });
    if (saved && !saved.invalidatedAt) {
      this.aiLogger.log({ message: 'try-on reused', items: ids.length });
      return { imageUrl: await this.s3.getDownloadUrl(saved.imageKey) };
    }

    const jpeg = await this.render(userId, bodyPhoto.imageKey, itemIds);
    const key = this.s3.buildKey(userId, 'tryon', 'jpg');
    await this.s3.putObject(key, jpeg, 'image/jpeg');
    const imageKey = await this.save(userId, renderKey, ids, key, saved);
    return { imageUrl: await this.s3.getDownloadUrl(imageKey) };
  }

  // ---- Helpers ----

  // The try-on photo from Gemini, as a JPEG.
  private async render(userId: string, bodyKey: string, itemIds: string[]): Promise<Buffer>
  {
    const items = await this.loadItems(userId, itemIds);
    const body = await this.loadImage(bodyKey);
    const aspectRatio = closestAspectRatio(await sharp(body.image).metadata());

    const parts = this.buildParts(body, items);
    const started = Date.now();
    try {
      const response = await this.helpers.ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      });
      const durationMs = Date.now() - started;
      const candidate = response.candidates?.[0];
      const data = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;

      this.aiLogger.log({
        message: 'try-on',
        model: IMAGE_MODEL,
        modelVersion: response.modelVersion,
        durationMs,
        seconds: seconds(durationMs),
        tokens: tokenCounts(response.usageMetadata),
        items: items.length,
        aspectRatio,
        finishReason: candidate?.finishReason,
        image: !!data,
      });

      // No image: Gemini declined (the prompt asks for one sentence saying
      // why) or its safety filter blocked it.
      if (!data) {
        const reason = response.text?.trim().slice(0, 200);
        throw new UnprocessableEntityException({ message: reason || DECLINED });
      }

      return await sharp(Buffer.from(data, 'base64'))
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (err) {
      this.aiLogger.error(`try-on failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
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
  // than skipped, or the photo would quietly leave out a piece.
  private async loadItems(userId: string, itemIds: string[]): Promise<TryOnItem[]>
  {
    const ids = [...new Set(itemIds)];
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, name: true, category: true, type: true, fit: true, imageKey: true, cutoutKey: true },
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

  // The prompt, the user's photo, then each item: a details line followed by its photo.
  private buildParts(body: { image: Buffer; mimeType: string }, items: TryOnItem[]): Part[]
  {
    const parts: Part[] = [
      { text: TRY_ON_PROMPT },
      { text: USER_PHOTO_LABEL },
      { inlineData: { mimeType: body.mimeType, data: body.image.toString('base64') } },
      { text: OUTFIT_HEADER },
    ];
    for (const item of items) {
      parts.push(
        { text: describeItem(item) },
        { inlineData: { mimeType: item.mimeType, data: item.image.toString('base64') } },
      );
    }
    return parts;
  }
}

// e.g. "name: Navy crew-neck sweater | category: Top | type: sweater | fit: Relaxed".
// Empty fields are left out.
function describeItem(item: TryOnItem): string
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
function closestAspectRatio(meta: sharp.Metadata): string
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

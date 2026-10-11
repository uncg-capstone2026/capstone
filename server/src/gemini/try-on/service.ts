import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Part } from '@google/genai';
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

// Try-on: a photo of the user wearing the outfit on screen, made from their
// primary try-on photo and the items' photos.
@Injectable()
export class TryOnService {
  // Summaries go to the terminal and logs/ai/.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly helpers: GeminiHelpers,
  )
  {}

  // Generates the photo, saves it to S3 as a JPEG and returns a signed URL to
  // it. 404 when there's no try-on photo or an item isn't in the user's
  // closet; 422 when Gemini declines (e.g. the photo doesn't show one person).
  async generate(userId: string, itemIds: string[]): Promise<{ imageUrl: string }>
  {
    const bodyPhoto = await this.prisma.tryOnPhoto.findFirst({
      where: { userId, isPrimary: true },
      orderBy: { capturedAt: 'desc' }, // newest, just in case there were ever two
      select: { imageKey: true },
    });
    if (!bodyPhoto) throw new NotFoundException({ message: NO_BODY_PHOTO });

    const items = await this.loadItems(userId, itemIds);
    const body = await this.loadImage(bodyPhoto.imageKey);
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

      const jpeg = await sharp(Buffer.from(data, 'base64'))
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer();
      const key = this.s3.buildTryOnKey(userId);
      await this.s3.putObject(key, jpeg, 'image/jpeg');
      return { imageUrl: await this.s3.getDownloadUrl(key) };
    } catch (err) {
      this.aiLogger.error(`try-on failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  // ---- Helpers ----

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

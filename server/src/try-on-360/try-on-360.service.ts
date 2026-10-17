import { BadRequestException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Part } from '@google/genai';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { GeminiHelpers } from '../gemini/helpers';
import { TRY_ON_PROMPT, USER_PHOTO_LABEL } from '../gemini/try-on/prompt';
import { closestAspectRatio, TryOnService, type TryOnItem } from '../gemini/try-on/service';
import { stylingNotes } from '../gemini/try-on/styling';
import {
  BACK, baseParts, dressParts, generateFrame, type Image, inline, OTHERS, outfitParts, runRound, STEP,
} from '../gemini/try-on/turnaround';
import { BACK_PHOTO_LABEL, BACK_VIEW_PROMPT, FRONT_VIEW_LABEL, turnPrompt } from '../gemini/try-on/turnaround-prompt';
import { AI_LOG_CONTEXT } from '../logger.config';
import { S3Service } from '../s3/s3.service';

// ---- Test routes only ----
// Everything in this file backs the POST /try-on-360/* test routes. The real
// try-on is TryOnService (gemini/try-on/service.ts); this runs the same
// generation on photos sent with the request, saves nothing to the database,
// and keeps the frames under tryon/, which an S3 lifecycle rule deletes after
// a few days.

const UNAVAILABLE = "StyleMe couldn't create your try-on right now. Please try again.";

export type Frame360 = {
  position: number; // 0–11; 0 is the front, 6 the back
  angle: number; // position × 30, turned to the person's right
  imageUrl: string | null; // signed, 24 hours; null when this frame failed
  round: number;
  ms: number;
  error?: string;
};

// One request's frames. Files go to tryon/{userId}/{folder}/{runId}/NN.jpg.
type Run = {
  userId: string;
  runId: string;
  folder: string;
  aspectRatio: string;
  started: number;
  frames: Frame360[];
};

@Injectable()
export class TryOn360Service {
  // Summaries go to the terminal and logs/ai/.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

  constructor(
    private readonly s3: S3Service,
    private readonly helpers: GeminiHelpers,
    private readonly tryOn: TryOnService,
  )
  {}

  // POST /try-on-360/base: 12 views of the user in their own clothes, all in
  // the front photo's pose. Frame 0 is the front photo itself.
  async generateBase(userId: string, front: Buffer, back: Buffer)
  {
    const [frontPhoto, backPhoto] = await readPhotos([front, back]);
    const run = this.newRun(userId, '360-base', closestAspectRatio(await sharp(front).metadata()));

    run.frames.push(await this.saveFrame(run, 0, 1, frontPhoto!.image, run.started));
    await this.round(run, OTHERS, 2, frontPhoto!, (position) => baseParts(position, frontPhoto!, backPhoto!));
    return result(run);
  }

  // POST /try-on-360: the 12 base views (slots[N] for position N) dressed in
  // the outfit. slots[0] is required; a missing slot is a failed frame.
  async dress(userId: string, slots: (Buffer | undefined)[], itemIds: string[])
  {
    const items = await this.tryOn.loadItems(userId, itemIds);
    const bases = await readPhotos(slots);
    const run = this.newRun(userId, '360', closestAspectRatio(await sharp(slots[0]!).metadata()));
    const notes = stylingNotes(items);

    const front = await this.front(run, dressParts(0, bases[0]!, undefined, items, notes));
    await this.round(run, OTHERS, 2, front, (position) => {
      const base = bases[position];
      if (!base) throw new Error(`No photo in angle${position}`);
      return dressParts(position, base, front, items, notes);
    });
    return result(run);
  }

  // POST /try-on-360/direct: turns and dresses at once, from the front and
  // back photos.
  async generate360(userId: string, front: Buffer, back: Buffer, itemIds: string[])
  {
    const items = await this.tryOn.loadItems(userId, itemIds);
    const [frontPhoto, backPhoto] = await readPhotos([front, back]);
    const run = this.newRun(userId, '360', closestAspectRatio(await sharp(front).metadata()));

    const dressedFront = await this.front(run, [{ text: TRY_ON_PROMPT }, { text: USER_PHOTO_LABEL }, inline(frontPhoto!), ...outfitParts(items)]);
    await this.round(run, OTHERS, 2, dressedFront, (position) => directParts(position, dressedFront, backPhoto!, items));
    return result(run);
  }

  // ---- Rounds ----

  private newRun(userId: string, folder: string, aspectRatio: string): Run
  {
    return { userId, runId: randomUUID(), folder, aspectRatio, started: Date.now(), frames: [] };
  }

  // Round 1: frame 0. It failing fails the request (422/503), since every
  // other frame is made from it.
  private async front(run: Run, parts: Part[]): Promise<Image>
  {
    const started = Date.now();
    try {
      const frame = await generateFrame(this.helpers, this.aiLogger, {
        label: `try-on-${run.folder}`, position: 0, round: 1, aspectRatio: run.aspectRatio, parts,
      });
      run.frames.push(await this.saveFrame(run, 0, 1, frame.image, started));
      return frame;
    } catch (err) {
      throw toHttpError(err);
    }
  }

  // The other frames in parallel, each color-matched to frame 0. A failed
  // frame comes back with imageUrl null.
  private async round(run: Run, positions: number[], round: number, reference: Image, build: (position: number) => Part[]): Promise<void>
  {
    const { done, failed } = await runRound(positions, async (position) => {
      const started = Date.now();
      const frame = await generateFrame(this.helpers, this.aiLogger, {
        label: `try-on-${run.folder}`, position, round, aspectRatio: run.aspectRatio, parts: build(position), reference,
      });
      return this.saveFrame(run, position, round, frame.image, started);
    });
    run.frames.push(...done.values());
    failed.forEach((err, position) => {
      run.frames.push({ position, angle: position * STEP, imageUrl: null, round, ms: 0, error: err.message });
    });
  }

  // Uploads a finished frame and returns it with a signed URL.
  private async saveFrame(run: Run, position: number, round: number, jpeg: Buffer, started: number): Promise<Frame360>
  {
    const key = `tryon/${run.userId}/${run.folder}/${run.runId}/${String(position).padStart(2, '0')}.jpg`;
    await this.s3.putObject(key, jpeg, 'image/jpeg');
    return {
      position,
      angle: position * STEP,
      imageUrl: await this.s3.getDownloadUrl(key),
      round,
      ms: Date.now() - started,
    };
  }
}

// ---- Helpers ----

// Direct: the back from the dressed front and the back photo; every other
// frame the same way, turned to its angle.
function directParts(position: number, dressedFront: Image, back: Image, items: TryOnItem[]): Part[]
{
  return [
    { text: position === BACK ? BACK_VIEW_PROMPT : turnPrompt(position * STEP) },
    { text: FRONT_VIEW_LABEL }, inline(dressedFront),
    { text: BACK_PHOTO_LABEL }, inline(back),
    ...outfitParts(items),
  ];
}

// The frames in position order, with the total time.
function result(run: Run)
{
  const frames = [...run.frames].sort((a, b) => a.position - b.position);
  return { runId: run.runId, totalMs: Date.now() - run.started, frames };
}

// Uploaded photos as upright JPEGs (missing ones stay missing). 400 when one
// isn't really an image.
async function readPhotos(photos: (Buffer | undefined)[]): Promise<(Image | undefined)[]>
{
  try {
    return await Promise.all(photos.map((photo) => (photo ? toJpeg(photo) : undefined)));
  } catch {
    throw new BadRequestException({ message: "One of the photos couldn't be read as an image." });
  }
}

// An uploaded photo as an upright JPEG, since Gemini isn't sent other types.
async function toJpeg(photo: Buffer): Promise<Image>
{
  const image = await sharp(photo).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  return { image, mimeType: 'image/jpeg' };
}

// Nest errors (422 Gemini declined) pass through; anything else is a 503,
// as in /try-on.
function toHttpError(err: unknown): HttpException
{
  return err instanceof HttpException ? err : new ServiceUnavailableException({ message: UNAVAILABLE });
}

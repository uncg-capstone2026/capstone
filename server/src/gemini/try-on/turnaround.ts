import { type Logger, UnprocessableEntityException } from '@nestjs/common';
import type { Part } from '@google/genai';
import sharp from 'sharp';
import { IMAGE_MODEL } from '../constants';
import { GeminiHelpers, seconds, tokenCounts } from '../helpers';
import { OUTFIT_HEADER, TRY_ON_PROMPT, USER_PHOTO_LABEL } from './prompt';
import {
  BACK_PHOTO_LABEL, BASE_BACK_PROMPT, BASE_VIEW_LABEL, baseTurnPrompt, DRESSED_FRONT_LABEL, dressPrompt,
  FRONT_VIEW_LABEL,
} from './turnaround-prompt';
import { describeItem, type TryOnItem } from './service';

// The 360° try-on: 12 frames, 30° apart, of the person turned in place to
// their right. 0 is the front, 3 their left side, 6 the back, 9 their right
// side. Frame 0 is made first; every other frame is made from it.

export const FRAMES = 12;
export const STEP = 360 / FRAMES; // 30° between frames
export const BACK = 6;

// Every frame but the front.
export const OTHERS = Array.from({ length: FRAMES - 1 }, (_, i) => i + 1);

export const DECLINED = "StyleMe couldn't create a try-on with this photo.";

// How far a frame's contrast can be scaled to match frame 0. Kept close to 1
// so a frame that really looks different (e.g. the back, with more hair)
// isn't pushed too far.
const MIN_GAIN = 0.8;
const MAX_GAIN = 1.25;

export type Image = { image: Buffer; mimeType: string };

export type FrameRequest = {
  label: string; // for the logs, e.g. 'try-on-360'
  position: number;
  round: number;
  aspectRatio: string;
  parts: Part[];
  // Frame 0, whose brightness and colors every other frame is matched to.
  reference?: Image;
};

// One frame from Gemini, as a JPEG. 422 when Gemini declines; any other
// error is thrown as is. Failures are logged here.
export async function generateFrame(helpers: GeminiHelpers, logger: Logger, frame: FrameRequest): Promise<Image>
{
  const started = Date.now();
  try {
    const response = await helpers.ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: frame.parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: frame.aspectRatio },
      },
    });
    const durationMs = Date.now() - started;
    const candidate = response.candidates?.[0];
    const data = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;

    logger.log({
      message: frame.label,
      position: frame.position,
      round: frame.round,
      model: IMAGE_MODEL,
      modelVersion: response.modelVersion,
      durationMs,
      seconds: seconds(durationMs),
      tokens: tokenCounts(response.usageMetadata),
      aspectRatio: frame.aspectRatio,
      finishReason: candidate?.finishReason,
      image: !!data,
    });

    // No image: Gemini declined or its safety filter blocked it.
    if (!data) {
      const reason = response.text?.trim().slice(0, 200);
      throw new UnprocessableEntityException({ message: reason || DECLINED });
    }

    // Every frame but 0 gets frame 0's brightness and colors, so the spin
    // doesn't flicker.
    const generated = Buffer.from(data, 'base64');
    const reference = frame.position === 0 ? undefined : frame.reference;
    const [a, b] = reference ? await matchColors(generated, reference.image) : [1, 0];
    const jpeg = await sharp(generated)
      .flatten({ background: '#ffffff' })
      .linear(a, b)
      .jpeg({ quality: 85 })
      .toBuffer();
    return { image: jpeg, mimeType: 'image/jpeg' };
  } catch (err) {
    logger.error(`${frame.label} frame ${frame.position} failed: ${(err as Error).message}`, (err as Error).stack);
    throw err;
  }
}

// Runs one round's frames in parallel: what each finished frame returned, and
// the error each failed one threw.
export async function runRound<T>(
  positions: number[],
  make: (position: number) => Promise<T>,
): Promise<{ done: Map<number, T>; failed: Map<number, Error> }>
{
  const results = await Promise.allSettled(positions.map((position) => make(position)));
  const done = new Map<number, T>();
  const failed = new Map<number, Error>();
  results.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') done.set(positions[i], outcome.value);
    else failed.set(positions[i], outcome.reason as Error);
  });
  return { done, failed };
}

// ---- What Gemini gets for each frame ----

// Base angles (the user in their own clothes): every frame from the front
// photo (frame 0) and the back photo.
export function baseParts(position: number, front: Image, back: Image): Part[]
{
  return [
    { text: position === BACK ? BASE_BACK_PROMPT : baseTurnPrompt(position * STEP) },
    { text: FRONT_VIEW_LABEL }, inline(front),
    { text: BACK_PHOTO_LABEL }, inline(back),
  ];
}

// Dressing: the front like a normal try-on; every other frame from its base
// angle and the dressed front. All get the same styling notes (tucked, open,
// ...), so every frame wears the outfit the same way.
export function dressParts(position: number, base: Image, dressedFront: Image | undefined, items: TryOnItem[], notes: string[]): Part[]
{
  const parts: Part[] = position === 0
    ? [{ text: TRY_ON_PROMPT }, { text: USER_PHOTO_LABEL }, inline(base)]
    : [
      { text: dressPrompt(position * STEP) },
      { text: BASE_VIEW_LABEL }, inline(base),
      { text: DRESSED_FRONT_LABEL }, inline(dressedFront!),
    ];
  const styling: Part[] = notes.length > 0
    ? [{ text: `How to wear the outfit (the same in every frame):\n${notes.map((note) => `- ${note}`).join('\n')}` }]
    : [];
  return [...parts, ...outfitParts(items), ...styling];
}

// The outfit, after the photos: a header, then each item's details and photo.
export function outfitParts(items: TryOnItem[]): Part[]
{
  return [{ text: OUTFIT_HEADER }, ...items.flatMap((item) => [{ text: describeItem(item) }, inline(item)])];
}

export function inline(image: Image): Part
{
  return { inlineData: { mimeType: image.mimeType, data: image.image.toString('base64') } };
}

// The linear(a, b) that gives each RGB channel of `frame` the mean and
// spread of the same channel in `reference`. Leaves the frame as is when
// either isn't RGB.
async function matchColors(frame: Buffer, reference: Buffer): Promise<[number[], number[]]>
{
  const [own, target] = await Promise.all([sharp(frame).stats(), sharp(reference).stats()]);
  if (own.channels.length < 3 || target.channels.length < 3) return [[1, 1, 1], [0, 0, 0]];

  const a: number[] = [];
  const b: number[] = [];
  for (let c = 0; c < 3; c++) {
    const from = own.channels[c];
    const to = target.channels[c];
    const gain = from.stdev > 0 ? Math.min(MAX_GAIN, Math.max(MIN_GAIN, to.stdev / from.stdev)) : 1;
    a.push(gain);
    b.push(to.mean - gain * from.mean);
  }
  return [a, b];
}

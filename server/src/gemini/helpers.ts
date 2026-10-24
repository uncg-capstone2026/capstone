import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Schema, type GenerateContentResponseUsageMetadata } from '@google/genai';
import type { Weather } from '../weather/weather.service';
import type { PromptNote } from '../style-notes/style-notes.service';
import { EMBEDDABLE_IMAGE_TYPES, MAIN_MODEL } from './constants';

// Formats a list for a prompt: ['a', 'b'] -> '"a", "b"'.
export const quoteList = (xs: readonly string[]) => xs.map((x) => `"${x}"`).join(', ');

// Every one of the user's style notes (StyleNotesService.listForPrompt),
// newest first, each with where it came from and when, plus how to settle
// two that conflict: the user's own beats a learned one, then newer wins.
export function styleNotesText(notes: PromptNote[]): string
{
  const lines = notes.map((note) => `- [${note.source}, ${note.createdAt.toISOString().slice(0, 10)}] ${note.text}`);
  return `What the user has told us about their style, newest first. "user" notes are ones they wrote themselves; "learned" notes were worked out from their past outfits. If two notes conflict, a user note always wins over a learned one; between two notes from the same source, the newer one wins.
${lines.join('\n')}`;
}

// One line for a prompt, in °F since users are in the US, e.g. "Weather on
// 2026-10-06 in Greensboro: Partly cloudy, high 72°F, low 55°F, ...".
export function describeWeather(w: Weather): string
{
  const r = Math.round;
  return `Weather on ${w.date} in ${w.locationName}: ${w.condition}, ` +
    `high ${r(w.highF)}°F, low ${r(w.lowF)}°F, feels like ${r(w.feelsLikeF)}°F, ` +
    `${r(w.chanceOfRain)}% chance of rain, wind ${r(w.windKph)} km/h, UV ${r(w.uvIndex)}.`;
}

// MIME type of a PNG/JPEG photo from its S3 key's extension; null for anything
// else (e.g. webp), which Gemini isn't sent.
export function mimeTypeForKey(key: string): string | null
{
  if (/\.png$/i.test(key)) return 'image/png';
  if (/\.jpe?g$/i.test(key)) return 'image/jpeg';
  return null;
}

// Token counts from a Gemini response, for the AI log.
export function tokenCounts(usage?: GenerateContentResponseUsageMetadata)
{
  return {
    prompt: usage?.promptTokenCount,
    output: usage?.candidatesTokenCount,
    thinking: usage?.thoughtsTokenCount,
    total: usage?.totalTokenCount,
  };
}

// A duration for the AI log, easier to read than ms: 4213 -> '4.21s'.
export function seconds(ms: number): string
{
  return `${(ms / 1000).toFixed(2)}s`;
}

// Shared by every Gemini feature service: the one Gemini client, plus the
// helpers more than one feature needs.
@Injectable()
export class GeminiHelpers {
  readonly ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // The JSON text, plus token counts (usage) and the model that actually
  // answered (modelVersion; '-latest' names can change) for logging.
  async generateJson(
    prompt: string,
    responseSchema: Schema,
    model = MAIN_MODEL,
  ): Promise<{ text: string; usage?: GenerateContentResponseUsageMetadata; modelVersion?: string }>
  {
    const response = await this.ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    return { text: response.text ?? '', usage: response.usageMetadata, modelVersion: response.modelVersion };
  }

  assertSupportedImage(mimeType: string)
  {
    if (!(EMBEDDABLE_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
      throw new Error(
        `Unsupported image type "${mimeType}", expected one of: ${EMBEDDABLE_IMAGE_TYPES.join(', ')}`,
      );
    }
  }
}

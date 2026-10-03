import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Schema } from '@google/genai';
import { EMBEDDABLE_IMAGE_TYPES } from './constants';

// Formats a list for a prompt: ['a', 'b'] -> '"a", "b"'.
export const quoteList = (xs: readonly string[]) => xs.map((x) => `"${x}"`).join(', ');

// MIME type of a PNG/JPEG photo from its S3 key's extension; null for anything
// else (e.g. webp), which Gemini isn't sent.
export function mimeTypeForKey(key: string): string | null
{
  if (/\.png$/i.test(key)) return 'image/png';
  if (/\.jpe?g$/i.test(key)) return 'image/jpeg';
  return null;
}

// Shared by every Gemini feature service: the one Gemini client, plus the
// helpers more than one feature needs.
@Injectable()
export class GeminiHelpers {
  readonly ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async generateJson(prompt: string, responseSchema: Schema, model = 'gemini-flash-latest'): Promise<string>
  {
    const response = await this.ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    return response.text ?? '';
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

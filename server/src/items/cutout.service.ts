// Background removal uses Stability AI's API directly (STABILITY_API_KEY).
// PLAN.md originally recommended Amazon Nova Canvas on Bedrock, but Nova Canvas
// reached end-of-life on Sept 30, 2026. Stability's Remove Background on Bedrock
// only works through a cross-region inference profile, which kept returning
// ServiceUnavailableException (Oct 1, 2026), so we call Stability directly instead.
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

const REMOVE_BG_URL = 'https://api.stability.ai/v2beta/stable-image/edit/remove-background';

@Injectable()
export class CutoutService {
  // Takes the original photo, returns a transparent PNG of just the clothing item.
  async removeBackground(original: Buffer): Promise<Buffer> {
    // Shrink big phone photos (faster and cheaper) and fix sideways phone photos.
    const resized = await sharp(original)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(resized)], { type: 'image/png' }), 'item.png');
    form.append('output_format', 'png');

    const res = await fetch(REMOVE_BG_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: 'image/*',
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`Stability API returned ${res.status}: ${detail}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
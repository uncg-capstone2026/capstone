import { Injectable } from '@nestjs/common';
import {
  CATEGORY_BY_TYPE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  MAIN_MODEL,
  type Category,
  type ClothingType,
  type FitValue,
  type FormalityLevel,
  type Pattern,
  type Season,
} from '../constants';
import { GeminiHelpers } from '../helpers';
import { IMAGE_ATTRIBUTES_PROMPT } from './prompt';
import { IMAGE_ATTRIBUTES_RESPONSE_SCHEMA } from './schema';

// What extractImageAttributes returns. Each field lines up with a column on
// the Item model in prisma/schema.prisma (category and fit use its enum names).
export type ImageAttributes = {
  name: string;
  type: ClothingType;
  category: Category;
  colorHex: string[];
  pattern: Pattern | null;
  material: string | null;
  season: Season | null;
  formality: FormalityLevel | null;
  fit: FitValue | null;
};

// Adding an item: tag the photo, then embed it.
@Injectable()
export class ImageProcessingService {
  constructor(private readonly helpers: GeminiHelpers)
  {}

  // Fills in a newly uploaded item's fields from a photo of the garment; the
  // user can edit them afterwards. category is derived from type, not chosen
  // by the model.
  async extractImageAttributes(image: Buffer, mimeType: string): Promise<ImageAttributes>
  {
    this.helpers.assertSupportedImage(mimeType);

    const response = await this.helpers.ai.models.generateContent({
      model: MAIN_MODEL,
      contents: [
        { inlineData: { mimeType, data: image.toString('base64') } },
        { text: IMAGE_ATTRIBUTES_PROMPT },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: IMAGE_ATTRIBUTES_RESPONSE_SCHEMA,
      },
    });
    const text = response.text ?? '';

    let attributes: Omit<ImageAttributes, 'category'>;
    try {
      attributes = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned invalid JSON: ${text || '(empty)'}`);
    }

    const colorHex = (attributes.colorHex ?? [])
      .map((hex) => hex.toUpperCase())
      .filter((hex) => /^#[0-9A-F]{6}$/.test(hex));
    if (colorHex.length === 0) {
      throw new Error(
        `Image attributes returned no valid hex colors: ${JSON.stringify(attributes.colorHex)}`,
      );
    }

    const category = CATEGORY_BY_TYPE[attributes.type];
    if (!category) {
      throw new Error(`Image attributes returned an unknown type: ${JSON.stringify(attributes.type)}`);
    }

    return { ...attributes, colorHex, category };
  }

  async embedImage(image: Buffer, mimeType: string): Promise<number[]>
  {
    this.helpers.assertSupportedImage(mimeType);

    const response = await this.helpers.ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ inlineData: { mimeType, data: image.toString('base64') } }],
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${values?.length ?? 'none'}`,
      );
    }
    return values;
  }
}

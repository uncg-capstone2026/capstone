import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Schema } from '@google/genai';
import {
  EMBEDDABLE_IMAGE_TYPES,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  CATEGORY_BY_TYPE,
  CLOTHING_TYPES,
  type ClothingType,
} from './constants';
import {
  IMAGE_ATTRIBUTES_PROMPT,
  IMAGE_ATTRIBUTES_RESPONSE_SCHEMA,
  QUERY_EXPANSION_PROMPT,
  QUERY_EXPANSION_RESPONSE_SCHEMA,
} from './prompts';

@Injectable()
export class GeminiService {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async generateJson(
    prompt: string,
    responseSchema: Schema,
    model = 'gemini-flash-latest',
  ): Promise<string> {
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

  private assertSupportedImage(mimeType: string) {
    if (!(EMBEDDABLE_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
      throw new Error(
        `Unsupported image type "${mimeType}", expected one of: ${EMBEDDABLE_IMAGE_TYPES.join(', ')}`,
      );
    }
  }

  async embedImage(image: Buffer, mimeType: string): Promise<number[]> {
    this.assertSupportedImage(mimeType);

    const response = await this.ai.models.embedContent({
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

  // Returns one vector per text, in the same order as the input.
  async embedTexts(texts: string[]): Promise<number[][]> {
    // Each text must be its own Content object; a plain string array is
    // merged into a single embedding by gemini-embedding-2.
    const response = await this.ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts.map((text) => ({ parts: [{ text }] })),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });

    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(
        `Expected ${texts.length} embeddings, got ${embeddings.length}`,
      );
    }
    return embeddings.map((embedding, i) => {
      const values = embedding.values;
      if (!values || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding for text ${i}, got ${values?.length ?? 'none'}`,
        );
      }
      return values;
    });
  }

  async expandQuery(userRequest: string) {
    const promptWithTypes = QUERY_EXPANSION_PROMPT.replace(
      '{available_types}',
      CLOTHING_TYPES.join(', '),
    );
    const fullPrompt = `${promptWithTypes}\n\nUser request: ${userRequest}`;
    const text = await this.generateJson(
      fullPrompt,
      QUERY_EXPANSION_RESPONSE_SCHEMA,
    );

    let expanded: {
      items: { type: string; semantic_query: string }[];
      [key: string]: unknown;
    };
    try {
      expanded = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned invalid JSON: ${text || '(empty)'}`);
    }

    if (!Array.isArray(expanded.items) || expanded.items.length === 0) {
      throw new Error('Query expansion returned no items');
    }
    for (const item of expanded.items) {
      if (!item.semantic_query?.trim()) {
        throw new Error(
          `Query expansion returned an empty semantic_query for "${item.type}"`,
        );
      }
    }
    return expanded;
  }

  // Expands the request, then attaches each item's semantic_query embedding
  // to that item.
  async expandAndEmbedQuery(userRequest: string) {
    const expanded = await this.expandQuery(userRequest);
    const vectors = await this.embedTexts(
      expanded.items.map((item) => item.semantic_query),
    );
    return {
      ...expanded,
      items: expanded.items.map((item, i) => ({
        ...item,
        embedding: vectors[i],
      })),
    };
  }

  // Prefills an item's fields from a photo of the garment; the user reviews
  // them before saving. category is derived from type, not chosen by the model.
  async extractImageAttributes(image: Buffer, mimeType: string) {
    this.assertSupportedImage(mimeType);

    const response = await this.ai.models.generateContent({
      model: 'gemini-flash-latest',
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

    let attributes: {
      type: ClothingType;
      colorHex: string[];
      [key: string]: unknown;
    };
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

    return {
      ...attributes,
      colorHex,
      category: CATEGORY_BY_TYPE[attributes.type],
    };
  }
}

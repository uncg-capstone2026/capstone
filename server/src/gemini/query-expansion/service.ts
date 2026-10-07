import { Injectable } from '@nestjs/common';
import {
  CLOTHING_TYPES,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from '../constants';
import type { Weather } from '../../weather/weather.service';
import { GeminiHelpers, describeWeather } from '../helpers';
import { QUERY_EXPANSION_PROMPT } from './prompt';
import { QUERY_EXPANSION_RESPONSE_SCHEMA } from './schema';

// Stylist: expand the user's request into searchable items, then embed them.
@Injectable()
export class QueryExpansionService {
  constructor(private readonly helpers: GeminiHelpers)
  {}

  // weather is the forecast for the day the outfit is for, when known. It
  // comes before the search so the types picked suit the day.
  async expandQuery(userRequest: string, weather?: Weather | null)
  {
    const promptWithTypes = QUERY_EXPANSION_PROMPT.replace(
      '{available_types}',
      CLOTHING_TYPES.join(', '),
    );
    let fullPrompt = `${promptWithTypes}\n\nUser request: ${userRequest}`;
    if (weather) fullPrompt += `\n${describeWeather(weather)}`;
    const text = await this.helpers.generateJson(
      fullPrompt,
      QUERY_EXPANSION_RESPONSE_SCHEMA,
    );

    let expanded: { items: { type: string; semantic_query: string }[] };
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
  async expandAndEmbedQuery(userRequest: string, weather?: Weather | null)
  {
    const expanded = await this.expandQuery(userRequest, weather);
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

  // ---- Helpers ----

  // Returns one vector per text, in the same order as the input.
  async embedTexts(texts: string[]): Promise<number[][]>
  {
    // Each text must be its own Content object; a plain string array is
    // merged into a single embedding by gemini-embedding-2.
    const response = await this.helpers.ai.models.embedContent({
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
}

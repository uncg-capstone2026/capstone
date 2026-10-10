import { Injectable, Logger } from '@nestjs/common';
import {
  CLOTHING_TYPES,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  FAST_MODEL,
} from '../constants';
import type { Weather } from '../../weather/weather.service';
import { AI_LOG_CONTEXT } from '../../logger.config';
import { GeminiHelpers, describeWeather, seconds, tokenCounts } from '../helpers';
import { QUERY_EXPANSION_PROMPT } from './prompt';
import { QUERY_EXPANSION_RESPONSE_SCHEMA } from './schema';

type ExpandedQuery = { items: { type: string; semantic_query: string }[] };

// Stylist: expand the user's request into searchable items, then embed them.
@Injectable()
export class QueryExpansionService {
  // Summaries go to the terminal and logs/ai/; .debug (full output) to logs/ai/ only.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

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
    const weatherLine = weather ? describeWeather(weather) : null;
    let fullPrompt = `${promptWithTypes}\n\nUser request: ${userRequest}`;
    if (weatherLine) fullPrompt += `\n${weatherLine}`;

    const started = Date.now();
    let text = '';
    try {
      const result = await this.helpers.generateJson(
        fullPrompt,
        QUERY_EXPANSION_RESPONSE_SCHEMA,
        FAST_MODEL,
      );
      const durationMs = Date.now() - started;
      text = result.text;
      const expanded = this.parseExpansion(text);

      this.aiLogger.log({
        message: 'query expansion',
        model: FAST_MODEL,
        modelVersion: result.modelVersion,
        durationMs,
        seconds: seconds(durationMs),
        tokens: tokenCounts(result.usage),
        types: expanded.items.map((item) => item.type),
      });
      this.aiLogger.debug({
        message: 'query expansion output',
        request: userRequest,
        weather: weatherLine,
        output: expanded,
      });
      return expanded;
    } catch (err) {
      this.aiLogger.error(`query expansion failed: ${(err as Error).message}`, (err as Error).stack);
      // The raw answer, when Gemini gave one, so a bad output can be inspected.
      if (text) this.aiLogger.debug({ message: 'query expansion failed output', request: userRequest, output: text });
      throw err;
    }
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
    const started = Date.now();
    try {
      // Each text must be its own Content object; a plain string array is
      // merged into a single embedding by gemini-embedding-2.
      const response = await this.helpers.ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts.map((text) => ({ parts: [{ text }] })),
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const durationMs = Date.now() - started;
      const vectors = this.checkEmbeddings(response.embeddings ?? [], texts.length);

      // The vectors themselves aren't logged (768 numbers each).
      this.aiLogger.log({ message: 'query embedding', model: EMBEDDING_MODEL, durationMs, seconds: seconds(durationMs), count: texts.length });
      return vectors;
    } catch (err) {
      this.aiLogger.error(`query embedding failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  // Parses Gemini's answer and checks every item has a semantic_query.
  private parseExpansion(text: string): ExpandedQuery
  {
    let expanded: ExpandedQuery;
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

  // One full-size vector per text, or throws.
  private checkEmbeddings(embeddings: { values?: number[] }[], expected: number): number[][]
  {
    if (embeddings.length !== expected) {
      throw new Error(
        `Expected ${expected} embeddings, got ${embeddings.length}`,
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

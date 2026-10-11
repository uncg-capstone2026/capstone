import { Injectable, Logger } from '@nestjs/common';
import type { Part } from '@google/genai';
import { AI_LOG_CONTEXT } from '../../logger.config';
import { PrismaService } from '../../prisma/prisma.service';
import type { Weather } from '../../weather/weather.service';
import { S3Service } from '../../s3/s3.service';
import { CANDIDATES_STORED_PER_TYPE, MAIN_MODEL } from '../constants';
import { GeminiHelpers, describeWeather, mimeTypeForKey, seconds, tokenCounts } from '../helpers';
import {
  comboKey,
  validateOutfits,
  type CandidateLists,
  type RawOutfit,
  type ValidOutfit,
} from './candidates';
import {
  CANDIDATES_HEADER,
  FIXED_PIECES_HEADER,
  OUTFIT_SELECTION_PROMPT,
  neverRepeatText,
  shownBeforeText,
} from './prompt';
import { buildOutfitSelectionSchema } from './schema';

// A closet item ready to send to Gemini: its details plus its photo in memory.
export type OutfitCandidate = {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  colorHex: string[];
  pattern: string | null;
  material: string | null;
  season: string | null;
  formality: string | null;
  fit: string | null;
  image: Buffer;
  mimeType: string;
  photoKey: string; // S3 key of the photo above (cutout or original); never sent to Gemini or the app
};

// One checked outfit: fixed pieces first, then the ones Gemini chose.
export type SelectedOutfit = ValidOutfit<OutfitCandidate>;

export type SelectionInput = {
  request: string; // the user's request (with the date line, if any)
  weather?: Weather | null;
  candidates: OutfitCandidate[]; // what Gemini may choose from
  fixed?: OutfitCandidate[]; // pieces every outfit keeps (swap / refine)
  history?: string | null; // the conversation so far, already formatted
  shownOutfits?: string[][]; // outfits shown before, as item ids; never repeated
  softAvoidIds?: string[]; // items shown before; allowed but not preferred
  banned?: Set<string>; // items the user asked to replace; never used
};

// Stylist: find matching clothes in the closet, then pick outfits from them.
@Injectable()
export class OutfitPlanningService {
  // Summaries go to the terminal and logs/ai/; .debug (full output) to logs/ai/ only.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly helpers: GeminiHelpers,
  )
  {}

  // The user's closest closet items for each expanded item, grouped by type,
  // closest first. One query per item, all sent at once. excludeIds skips
  // items (e.g. ones already found) so a second search reaches further.
  async findCandidates(
    userId: string,
    expandedItems: { type: string; embedding: number[] }[],
    opts: { limit?: number; excludeIds?: string[] } = {},
  ): Promise<CandidateLists>
  {
    const limit = opts.limit ?? CANDIDATES_STORED_PER_TYPE;
    const results = await Promise.all(
      expandedItems.map((item) =>
        this.findClosestItems(userId, item.type, item.embedding, limit, opts.excludeIds ?? []),
      ),
    );

    // The same type can be expanded twice; merge its lists, keeping each
    // item once with its best score.
    const lists: CandidateLists = {};
    expandedItems.forEach((item, i) => {
      const merged = new Map((lists[item.type] ?? []).map((c) => [c.itemId, c]));
      for (const row of results[i]) {
        const existing = merged.get(row.id);
        if (!existing || row.score < existing.score) merged.set(row.id, { itemId: row.id, score: row.score });
      }
      lists[item.type] = [...merged.values()].sort((a, b) => a.score - b.score).slice(0, limit);
    });
    return lists;
  }

  // Just each item's category, with no photo downloads: enough to check an
  // outfit can be built before loading candidates and calling Gemini.
  loadCategories(userId: string, ids: string[]): Promise<{ id: string; category: string | null }[]>
  {
    return this.prisma.item.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, category: true },
    });
  }

  // Loads each candidate's details and photo into memory, in the order of ids.
  // Uses the cutout when there is one so Gemini sees only the garment. Items
  // whose photo is an unsupported type or fails to download are left out, so
  // only the returned ids should be offered to Gemini.
  async loadCandidates(userId: string, ids: string[]): Promise<OutfitCandidate[]>
  {
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids }, userId },
      select: {
        id: true,
        name: true,
        category: true,
        type: true,
        colorHex: true,
        pattern: true,
        material: true,
        season: true,
        formality: true,
        fit: true,
        imageKey: true,
        cutoutKey: true,
      },
    });

    // findMany doesn't keep the order of ids, which is closest match first.
    const position = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    const loaded = await Promise.allSettled(
      items.map(async ({ imageKey, cutoutKey, ...details }) => {
        const key = cutoutKey ?? imageKey;
        const mimeType = mimeTypeForKey(key);
        if (!mimeType) throw new Error(`Unsupported image type: ${key}`);
        return { ...details, image: await this.s3.getObjectBuffer(key), mimeType, photoKey: key };
      }),
    );
    return loaded
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  // Asks Gemini for up to OUTFITS_PER_SELECTION outfits, best first, each with
  // a name and reasons. Every outfit returned is complete, new, and free of
  // banned items (checked here, since the schema can't express that). An
  // empty list means none could be built; missing then says why, if Gemini
  // gave a reason.
  async selectOutfits(input: SelectionInput): Promise<{ outfits: SelectedOutfit[]; missing: string | null }>
  {
    const parts = this.buildSelectionParts(input);
    const started = Date.now();
    let text = '';
    try {
      const response = await this.helpers.ai.models.generateContent({
        model: MAIN_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: buildOutfitSelectionSchema(input.candidates.map((c) => c.id)),
        },
      });
      const durationMs = Date.now() - started;
      text = response.text ?? '';

      let selection: { outfits?: RawOutfit[]; missing?: string | null };
      try {
        selection = JSON.parse(text);
      } catch {
        throw new Error(`Gemini returned invalid JSON: ${text || '(empty)'}`);
      }

      const outfits = validateOutfits(selection.outfits ?? [], {
        candidates: input.candidates,
        fixed: input.fixed,
        shownKeys: new Set((input.shownOutfits ?? []).map(comboKey)),
        banned: input.banned,
      });
      const missing = selection.missing?.trim() || null;

      this.aiLogger.log({
        message: 'outfit selection',
        model: MAIN_MODEL,
        modelVersion: response.modelVersion,
        durationMs,
        seconds: seconds(durationMs),
        tokens: tokenCounts(response.usageMetadata),
        candidates: input.candidates.length,
        fixed: input.fixed?.length ?? 0,
        returned: selection.outfits?.length ?? 0,
        kept: outfits.length,
        names: outfits.map((outfit) => outfit.name),
        missing,
      });
      // The prompt's text parts only; the photos are left out.
      this.aiLogger.debug({
        message: 'outfit selection output',
        request: input.request,
        history: input.history ?? null,
        banned: input.banned?.size ?? 0,
        shownOutfits: input.shownOutfits?.length ?? 0,
        prompt: parts.flatMap((part) => (part.text ? [part.text] : [])).join('\n'),
        output: selection,
        kept: outfits.map((outfit) => ({
          name: outfit.name,
          items: outfit.items.map((item) => `${item.type ?? 'untagged'}: ${item.name}`),
          reasons: outfit.reasons,
        })),
      });
      return { outfits, missing };
    } catch (err) {
      this.aiLogger.error(`outfit selection failed: ${(err as Error).message}`, (err as Error).stack);
      // The raw answer, when Gemini gave one, so a bad output can be inspected.
      if (text) this.aiLogger.debug({ message: 'outfit selection failed output', request: input.request, output: text });
      throw err;
    }
  }

  // ---- Helpers ----

  // The request for Gemini: the prompt, request and weather; then whichever
  // of history, outfits not to repeat and items shown before apply; then the
  // fixed pieces and the candidates, each a details line followed by its photo.
  private buildSelectionParts(input: SelectionInput): Part[]
  {
    const fixed = input.fixed ?? [];
    let header = `${OUTFIT_SELECTION_PROMPT}\n\nUser request: ${input.request}`;
    if (input.weather) header += `\n${describeWeather(input.weather)}`;
    const parts: Part[] = [{ text: header }];

    if (input.history) parts.push({ text: input.history });

    // Only outfits Gemini could actually rebuild from what it's sent matter.
    const available = new Set([...input.candidates, ...fixed].map((c) => c.id));
    const repeats = (input.shownOutfits ?? [])
      .filter((ids) => ids.length > 0 && ids.every((id) => available.has(id)));
    if (repeats.length > 0) parts.push({ text: neverRepeatText(repeats) });

    const candidateIds = new Set(input.candidates.map((c) => c.id));
    const softAvoid = (input.softAvoidIds ?? []).filter((id) => candidateIds.has(id));
    if (softAvoid.length > 0) parts.push({ text: shownBeforeText(softAvoid) });

    if (fixed.length > 0) {
      parts.push({ text: FIXED_PIECES_HEADER });
      for (const piece of fixed) parts.push(...this.itemParts(piece));
    }
    parts.push({ text: CANDIDATES_HEADER });
    for (const candidate of input.candidates) parts.push(...this.itemParts(candidate));
    return parts;
  }

  // A details line, then the photo it describes.
  private itemParts(item: OutfitCandidate): Part[]
  {
    return [
      { text: this.describeCandidate(item) },
      { inlineData: { mimeType: item.mimeType, data: item.image.toString('base64') } },
    ];
  }

  // The user's items of this type, closest to the embedding first, with their
  // cosine distance (<=>: 0 is identical). Prisma can't send the vector type,
  // so it goes in as '[0.1,...]' text and is cast in SQL.
  // Later: also skip items with excludeFromSuggestions once that column exists.
  private findClosestItems(
    userId: string,
    type: string,
    embedding: number[],
    limit: number,
    excludeIds: string[],
  ): Promise<{ id: string; score: number }[]>
  {
    const vector = `[${embedding.join(',')}]`;
    return this.prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT id, (embedding <=> ${vector}::vector)::float8 AS score
      FROM "Item"
      WHERE "userId" = ${userId}
        AND type = ${type}
        AND embedding IS NOT NULL
        AND NOT (id = ANY(${excludeIds}::text[]))
      ORDER BY score
      LIMIT ${limit}
    `;
  }

  // e.g. "id: abc | name: Navy crew-neck sweater | category: Top | ...".
  // Empty fields are left out.
  private describeCandidate(candidate: OutfitCandidate): string
  {
    const fields: [string, string | null][] = [
      ['id', candidate.id],
      ['name', candidate.name],
      ['category', candidate.category],
      ['type', candidate.type],
      ['colors', candidate.colorHex.join(', ') || null],
      ['pattern', candidate.pattern],
      ['material', candidate.material],
      ['season', candidate.season],
      ['formality', candidate.formality],
      ['fit', candidate.fit],
    ];
    return fields
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`)
      .join(' | ');
  }
}

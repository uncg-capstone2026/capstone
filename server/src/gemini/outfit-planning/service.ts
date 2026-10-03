import { Injectable } from '@nestjs/common';
import type { Part } from '@google/genai';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { CANDIDATES_PER_TYPE, MAX_OUTFIT_CANDIDATES } from '../constants';
import { mimeTypeForKey } from '../helpers';
import { OUTFIT_SELECTION_PROMPT } from './prompt';

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
};

// Stylist: find matching clothes in the closet, then pick outfits from them.
@Injectable()
export class OutfitPlanningService {
  constructor(private readonly prisma: PrismaService, private readonly s3: S3Service)
  {}

  // Returns the ids of the user's closest closet items for each expanded item.
  // Runs one query per item, all sent at once. An empty array means nothing
  // in the closet matched.
  async findCandidates(userId: string, expandedItems: { type: string; semantic_query: string; embedding: number[] }[]): Promise<string[]>
  {
    const results = await Promise.all(
      expandedItems.map((item) =>
        this.findClosestItems(userId, item.type, item.embedding),
      ),
    );

    // The same type can be expanded twice, so an item could match twice.
    // A Set keeps each id once, in the order it was first seen.
    return [...new Set(results.flat().map((row) => row.id))];
  }

  // Loads each candidate's details and photo into memory, in the order of ids.
  // Uses the cutout when there is one so Gemini sees only the garment. Items
  // whose photo is an unsupported type or fails to download are left out, so
  // only the returned ids should be offered to Gemini.
  async loadCandidates(userId: string, ids: string[]): Promise<OutfitCandidate[]>
  {
    const limitedIds = ids.slice(0, MAX_OUTFIT_CANDIDATES);
    const items = await this.prisma.item.findMany({
      where: { id: { in: limitedIds }, userId },
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
    const position = new Map(limitedIds.map((id, i) => [id, i]));
    items.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    const loaded = await Promise.allSettled(
      items.map(async ({ imageKey, cutoutKey, ...details }) => {
        const key = cutoutKey ?? imageKey;
        const mimeType = mimeTypeForKey(key);
        if (!mimeType) throw new Error(`Unsupported image type: ${key}`);
        return { ...details, image: await this.s3.getObjectBuffer(key), mimeType };
      }),
    );
    return loaded
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  // Builds the request for Gemini: the prompt, then for each candidate a
  // details line starting with its id, followed by its photo.
  buildSelectionParts(userRequest: string, candidates: OutfitCandidate[]): Part[]
  {
    const parts: Part[] = [
      { text: `${OUTFIT_SELECTION_PROMPT}\n\nUser request: ${userRequest}` },
    ];
    for (const candidate of candidates) {
      parts.push(
        { text: this.describeCandidate(candidate) },
        {
          inlineData: {
            mimeType: candidate.mimeType,
            data: candidate.image.toString('base64'),
          },
        },
      );
    }
    return parts;
  }

  // ---- Helpers ----

  // The user's items of this type, closest to the embedding first. Prisma can't
  // send the vector type, so it goes in as '[0.1,...]' text and is cast in SQL.
  // Later: also skip items with excludeFromSuggestions once that column exists.
  private findClosestItems(userId: string, type: string, embedding: number[]): Promise<{ id: string }[]>
  {
    const vector = `[${embedding.join(',')}]`;
    // <=> is cosine distance: 0 is identical, so ascending is closest first.
    return this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "Item"
      WHERE "userId" = ${userId}
        AND type = ${type}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${CANDIDATES_PER_TYPE}
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

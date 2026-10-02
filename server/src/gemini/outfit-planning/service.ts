import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CANDIDATES_PER_TYPE } from '../constants';

// Stylist: find matching clothes in the closet, then pick outfits from them.
@Injectable()
export class OutfitPlanningService {
  constructor(private readonly prisma: PrismaService)
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
}

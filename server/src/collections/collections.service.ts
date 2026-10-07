import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutfitsService, WITH_PIECES, type OutfitPiece, type OutfitWithPieces, type SavedOutfit } from '../outfits/outfits.service';

// Matches client/src/services/outfits.ts.
type OutfitPreview = OutfitPiece[];

// OutfitCollection: one card on the Outfits screen.
export type CollectionSummary = {
  id: string;
  name: string;
  outfitCount: number;
  cover: OutfitPreview | null; // the most recently added outfit's pieces; null when empty
};

// GET /api/collections: everything the Outfits screen shows (OutfitsOverview).
export type OutfitsOverview = {
  allOutfits: { count: number; cover: OutfitPreview | null };
  favorites: { count: number; cover: OutfitPreview | null };
  collections: CollectionSummary[]; // newest first
};

// GET /api/collections/:id (CollectionDetails).
export type CollectionDetails = {
  id: string;
  name: string;
  outfits: SavedOutfit[]; // most recently added first
};

const NAME_MAX_LENGTH = 40; // COLLECTION_NAME_MAX_LENGTH in the app
const NAME_LENGTH_MESSAGE = `Collection names must be 1-${NAME_MAX_LENGTH} characters.`;
const NAME_TAKEN_MESSAGE = 'You already have a collection with this name.';

// What a collection card needs: how many outfits, and the most recently added one.
const SUMMARY_INCLUDE = {
  _count: { select: { outfits: true } },
  outfits: {
    orderBy: { addedAt: 'desc' },
    take: 1,
    include: { outfit: { include: WITH_PIECES } },
  },
} satisfies Prisma.CollectionInclude;

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outfits: OutfitsService,
  ) {}

  // GET /api/collections
  async overview(userId: string): Promise<OutfitsOverview> {
    const [allCount, latest, favoritesCount, latestFavorite, collections] = await Promise.all([
      this.prisma.outfit.count({ where: { userId } }),
      this.prisma.outfit.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, include: WITH_PIECES }),
      this.prisma.outfit.count({ where: { userId, isFavorite: true } }),
      this.prisma.outfit.findFirst({
        where: { userId, isFavorite: true },
        orderBy: { createdAt: 'desc' },
        include: WITH_PIECES,
      }),
      this.prisma.collection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: SUMMARY_INCLUDE,
      }),
    ]);

    return {
      allOutfits: { count: allCount, cover: await this.cover(latest) },
      favorites: { count: favoritesCount, cover: await this.cover(latestFavorite) },
      collections: await Promise.all(
        collections.map(async (c) => ({
          id: c.id,
          name: c.name,
          outfitCount: c._count.outfits,
          cover: await this.cover(c.outfits[0]?.outfit ?? null),
        })),
      ),
    };
  }

  // POST /api/collections { name } -> the new, empty collection.
  async create(userId: string, rawName: string): Promise<CollectionSummary> {
    const name = checkName(rawName);
    await this.assertNameFree(userId, name);
    const collection = await this.prisma.collection.create({ data: { userId, name } });
    return { id: collection.id, name: collection.name, outfitCount: 0, cover: null };
  }

  // PATCH /api/collections/:id { name } -> the renamed collection.
  async rename(userId: string, id: string, rawName: string): Promise<CollectionSummary> {
    await this.findOwned(userId, id);
    const name = checkName(rawName);
    await this.assertNameFree(userId, name, id);
    await this.prisma.collection.update({ where: { id }, data: { name } });
    return this.summary(id);
  }

  // DELETE /api/collections/:id. Its CollectionOutfit rows go with it
  // (onDelete: Cascade); the outfits themselves stay in All saved outfits.
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.collection.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound();
  }

  // GET /api/collections/:id -> { id, name, outfits }, most recently added first.
  async details(userId: string, id: string): Promise<CollectionDetails> {
    const collection = await this.prisma.collection.findFirst({
      where: { id, userId },
      include: {
        outfits: {
          orderBy: { addedAt: 'desc' },
          include: { outfit: { include: WITH_PIECES } },
        },
      },
    });
    if (!collection) throw notFound();
    return {
      id: collection.id,
      name: collection.name,
      outfits: await Promise.all(collection.outfits.map((entry) => this.outfits.toSavedOutfit(entry.outfit))),
    };
  }

  // POST /api/collections/:id/outfits { outfitIds }. 404 if the collection or any
  // outfit isn't the user's. Outfits already in the collection are skipped.
  async addOutfits(userId: string, id: string, outfitIds: string[]): Promise<void> {
    await this.findOwned(userId, id);
    const ids = [...new Set(outfitIds)];
    const owned = await this.prisma.outfit.count({ where: { id: { in: ids }, userId } });
    if (owned !== ids.length) throw new NotFoundException({ message: 'Outfit not found' });

    await this.prisma.collectionOutfit.createMany({
      data: ids.map((outfitId) => ({ collectionId: id, outfitId })),
      skipDuplicates: true,
    });
  }

  // DELETE /api/collections/:id/outfits/:outfitId. Removes it from this
  // collection only; the outfit stays. Fine if it wasn't in the collection.
  async removeOutfit(userId: string, id: string, outfitId: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.collectionOutfit.deleteMany({ where: { collectionId: id, outfitId } });
  }

  // ---- Helpers ----

  // 404 unless the collection is the user's, so ids can't be probed.
  private async findOwned(userId: string, id: string) {
    const collection = await this.prisma.collection.findFirst({ where: { id, userId } });
    if (!collection) throw notFound();
    return collection;
  }

  // 409 if the user already has a collection with this name, ignoring case.
  // exceptId lets a collection keep its own name when renamed (e.g. only changing case).
  private async assertNameFree(userId: string, name: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.collection.findFirst({
      where: {
        userId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) throw new ConflictException({ message: NAME_TAKEN_MESSAGE });
  }

  private async summary(id: string): Promise<CollectionSummary> {
    const c = await this.prisma.collection.findUniqueOrThrow({ where: { id }, include: SUMMARY_INCLUDE });
    return {
      id: c.id,
      name: c.name,
      outfitCount: c._count.outfits,
      cover: await this.cover(c.outfits[0]?.outfit ?? null),
    };
  }

  // An outfit's pieces for a card cover, or null when there's no outfit.
  private async cover(outfit: OutfitWithPieces | null): Promise<OutfitPreview | null> {
    return outfit ? (await this.outfits.toSavedOutfit(outfit)).items : null;
  }
}

// Trimmed name, or 400 if it's empty or too long.
function checkName(rawName: string): string {
  const name = rawName.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    throw new BadRequestException({ message: NAME_LENGTH_MESSAGE });
  }
  return name;
}

function notFound() {
  return new NotFoundException({ message: 'Collection not found' });
}
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Item, OutfitSlot, Prisma } from '@prisma/client';
import { CATEGORY_TO_CLIENT } from '../items/item-mappings';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { dateToDay, dayToDate } from './calendar-day';

// One piece of an outfit, as the app shows it. Matches SuggestedPiece in
// client/src/services/stylist.ts (and the closet's item shape).
export type OutfitPiece = {
  id: string; // Item id
  name: string;
  category: string | null; // the app's name, e.g. 'tops' (null if untagged)
  type: string | null;
  imageUrl: string; // signed URL for the cutout, or the original
};

// GET /api/outfits. Matches SavedOutfit in client/src/services/outfits.ts.
// Dates go out as ISO strings.
export type SavedOutfit = {
  id: string;
  name: string;
  isFavorite: boolean;
  timesWorn: number;
  lastWorn: Date | null;
  createdAt: Date;
  items: OutfitPiece[]; // bottom layer first (zIndex order)
};

// A day the outfit is planned for (or was worn on).
export type ScheduledDay = { id: string; date: string; eventName: string | null }; // date: 'YYYY-MM-DD'

// GET /api/outfits/:id: the outfit plus its calendar days and collections.
export type OutfitDetails = SavedOutfit & {
  scheduled: ScheduledDay[]; // past and upcoming, earliest first
  collections: { id: string; name: string }[]; // most recently added first
};

// The slot each category goes in. Sets fill the whole outfit, like a one-piece.
const SLOT_BY_CATEGORY: Record<Category, OutfitSlot> = {
  Top: 'top',
  Bottoms: 'bottom',
  Outerwear: 'outerwear',
  OnePiece: 'onepiece',
  Sets: 'onepiece',
  Shoes: 'shoes',
  Accessory: 'accessory',
};
// Untagged items have no category yet; they're layered on top like accessories.
const UNTAGGED_SLOT: OutfitSlot = 'accessory';

// Flat-lay layering, bottom layer first: zIndex follows this order. Outerwear
// sits below the top, as in the app's flat-lay.
const LAYER_ORDER: OutfitSlot[] = ['shoes', 'bottom', 'onepiece', 'outerwear', 'top', 'accessory'];

const INCOMPLETE_MESSAGE = 'An outfit needs a top and bottoms, or a one-piece';

// What every outfit query loads: its pieces with their items, bottom layer first.
// Exported so collections load outfits the same way.
export const WITH_PIECES = {
  items: { include: { item: true }, orderBy: { zIndex: 'asc' } },
} satisfies Prisma.OutfitInclude;
export type OutfitWithPieces = Prisma.OutfitGetPayload<{ include: typeof WITH_PIECES }>;

@Injectable()
export class OutfitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // Creates an outfit from the user's items, with each piece's slot and zIndex
  // worked out from its category. 404 if any item isn't the user's.
  // Pass tx to run inside a transaction (the Stylist accept route creates the
  // CalendarEntry in the same one). Returns only the id; use getOne for the rest.
  async create(
    userId: string,
    input: { name: string; itemIds: string[] },
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const db: Prisma.TransactionClient = tx ?? this.prisma;

    const name = input.name.trim();
    if (!name) throw new BadRequestException({ message: 'Give the outfit a name' });

    const pieces = await this.buildPieces(db, userId, input.itemIds);
    return db.outfit.create({
      data: { userId, name, items: { create: pieces.map(({ itemId, slot, zIndex }) => ({ itemId, slot, zIndex })) } },
      select: { id: true },
    });
  }

  // GET /api/outfits: newest first. favoritesOnly for ?favorite=true.
  async list(userId: string, favoritesOnly: boolean): Promise<SavedOutfit[]> {
    const outfits = await this.prisma.outfit.findMany({
      where: { userId, ...(favoritesOnly ? { isFavorite: true } : {}) },
      orderBy: { createdAt: 'desc' },
      include: WITH_PIECES,
    });
    return Promise.all(outfits.map((outfit) => this.toSavedOutfit(outfit)));
  }

  // GET /api/outfits/:id, for the outfit details screen. 404 if it isn't the user's.
  async getOne(userId: string, id: string): Promise<OutfitDetails> {
    const outfit = await this.prisma.outfit.findFirst({
      where: { id, userId },
      include: {
        ...WITH_PIECES,
        calendarEntries: {
          orderBy: { date: 'asc' },
          select: { id: true, date: true, eventName: true },
        },
        collections: {
          where: { collection: { userId } },
          orderBy: { addedAt: 'desc' },
          select: { collection: { select: { id: true, name: true } } },
        },
      },
    });
    if (!outfit) throw notFound();

    return {
      ...(await this.toSavedOutfit(outfit)),
      scheduled: outfit.calendarEntries.map(toScheduledDay),
      collections: outfit.collections.map((entry) => entry.collection),
    };
  }

  // PATCH /api/outfits/:id { isFavorite?, itemIds? } -> the updated outfit.
  // New itemIds replace all of the outfit's pieces: 404 if any item isn't the
  // user's, 400 if the result isn't a complete outfit. Wear counts aren't touched.
  async update(
    userId: string,
    id: string,
    changes: { isFavorite?: boolean; itemIds?: string[] },
  ): Promise<OutfitDetails> {
    if (changes.isFavorite === undefined && changes.itemIds === undefined) {
      throw new BadRequestException({ message: 'Nothing to update' });
    }
    await this.assertOwned(userId, id);

    await this.prisma.$transaction(async (tx) => {
      if (changes.itemIds !== undefined) {
        const pieces = await this.buildPieces(tx, userId, changes.itemIds);
        if (!isComplete(pieces.map((piece) => piece.category))) {
          throw new BadRequestException({ message: INCOMPLETE_MESSAGE });
        }
        await tx.outfitItem.deleteMany({ where: { outfitId: id } });
        await tx.outfitItem.createMany({
          data: pieces.map(({ itemId, slot, zIndex }) => ({ outfitId: id, itemId, slot, zIndex })),
        });
      }
      if (changes.isFavorite !== undefined) {
        await tx.outfit.update({ where: { id }, data: { isFavorite: changes.isFavorite } });
      }
    });

    return this.getOne(userId, id);
  }

  // DELETE /api/outfits/:id. The database removes its OutfitItem,
  // CollectionOutfit and CalendarEntry rows with it (onDelete: Cascade).
  // 404 if it isn't the user's.
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.outfit.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound();
  }

  // POST /api/outfits/:id/schedule { date, eventName? } -> the new day.
  // Always adds a new entry, even for a day that already has one. A past date
  // is counted as worn by the next hourly wear-tracking run.
  async schedule(
    userId: string,
    id: string,
    input: { date: string; eventName?: string | null },
  ): Promise<ScheduledDay> {
    await this.assertOwned(userId, id);
    const entry = await this.prisma.calendarEntry.create({
      data: { outfitId: id, date: dayToDate(input.date), eventName: input.eventName?.trim() || null },
      select: { id: true, date: true, eventName: true },
    });
    return toScheduledDay(entry);
  }

  // DELETE /api/outfits/:id/schedule/:entryId. 404 if no such entry on the
  // user's outfit. Wear counts already added for it stay.
  async unschedule(userId: string, id: string, entryId: string): Promise<void> {
    const { count } = await this.prisma.calendarEntry.deleteMany({
      where: { id: entryId, outfitId: id, outfit: { userId } },
    });
    if (count === 0) throw new NotFoundException({ message: 'Scheduled day not found' });
  }

  // The app's SavedOutfit shape. Public so collections can reuse it for covers.
  async toSavedOutfit(outfit: OutfitWithPieces): Promise<SavedOutfit> {
    return {
      id: outfit.id,
      name: outfit.name,
      isFavorite: outfit.isFavorite,
      timesWorn: outfit.timesWorn,
      lastWorn: outfit.lastWorn,
      createdAt: outfit.createdAt,
      items: await Promise.all(outfit.items.map((piece) => this.toPiece(piece.item))),
    };
  }

  // ---- Helpers ----

  // The outfit's pieces: each item once (in the order sent), with its slot and
  // zIndex. 404 if any item isn't the user's. Shared by create and update.
  private async buildPieces(db: Prisma.TransactionClient, userId: string, rawItemIds: string[]) {
    const itemIds = [...new Set(rawItemIds)];
    const items = await db.item.findMany({
      where: { id: { in: itemIds }, userId },
      select: { id: true, category: true },
    });
    if (items.length !== itemIds.length) throw new NotFoundException({ message: 'Item not found' });

    const categoryById = new Map(items.map((item) => [item.id, item.category]));
    return itemIds
      .map((itemId) => {
        const category = categoryById.get(itemId) ?? null;
        return { itemId, category, slot: slotFor(category) };
      })
      // Stable sort: pieces in the same slot keep the order they were sent in.
      .sort((a, b) => LAYER_ORDER.indexOf(a.slot) - LAYER_ORDER.indexOf(b.slot))
      .map((piece, zIndex) => ({ ...piece, zIndex }));
  }

  // 404 unless the outfit is the user's.
  private async assertOwned(userId: string, id: string): Promise<void> {
    const outfit = await this.prisma.outfit.findFirst({ where: { id, userId }, select: { id: true } });
    if (!outfit) throw notFound();
  }

  private async toPiece(item: Item): Promise<OutfitPiece> {
    return {
      id: item.id,
      name: item.name,
      category: item.category ? CATEGORY_TO_CLIENT[item.category] : null,
      type: item.type,
      // Cutout if it's ready, otherwise the original photo.
      imageUrl: await this.s3.getDownloadUrl(item.cutoutKey ?? item.imageKey),
    };
  }
}

function slotFor(category: Category | null): OutfitSlot {
  return category ? SLOT_BY_CATEGORY[category] : UNTAGGED_SLOT;
}

// Complete means a OnePiece (or Sets, which fill the same slot), or a Top and Bottoms.
function isComplete(categories: (Category | null)[]): boolean {
  const has = (c: Category) => categories.includes(c);
  return has('OnePiece') || has('Sets') || (has('Top') && has('Bottoms'));
}

function toScheduledDay(entry: { id: string; date: Date; eventName: string | null }): ScheduledDay {
  return { id: entry.id, date: dateToDay(entry.date), eventName: entry.eventName };
}

function notFound() {
  return new NotFoundException({ message: 'Outfit not found' });
}
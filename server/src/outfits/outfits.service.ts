import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Item, OutfitSlot, Prisma } from '@prisma/client';
import { CATEGORY_TO_CLIENT } from '../items/item-mappings';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

// One piece of an outfit, as the app shows it. Matches SuggestedPiece in
// client/src/services/stylist.ts (and the closet's item shape).
export type OutfitPiece = {
  id: string; // Item id
  name: string;
  category: string | null; // the app's name, e.g. 'tops' (null if untagged)
  type: string | null;
  imageUrl: string; // signed URL for the cutout, or the original
};

// GET /api/outfits and GET /api/outfits/:id. Matches SavedOutfit in
// client/src/services/outfits.ts. Dates go out as ISO strings.
export type SavedOutfit = {
  id: string;
  name: string;
  isFavorite: boolean;
  timesWorn: number;
  lastWorn: Date | null;
  createdAt: Date;
  items: OutfitPiece[]; // bottom layer first (zIndex order)
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

// What every outfit query loads: its pieces with their items, bottom layer first.
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

    // Each item once, even if it was sent twice.
    const itemIds = [...new Set(input.itemIds)];
    const items = await db.item.findMany({
      where: { id: { in: itemIds }, userId },
      select: { id: true, category: true },
    });
    if (items.length !== itemIds.length) throw new NotFoundException({ message: 'Item not found' });

    const categoryById = new Map(items.map((item) => [item.id, item.category]));
    const pieces = itemIds
      .map((itemId) => ({ itemId, slot: slotFor(categoryById.get(itemId) ?? null) }))
      // Stable sort: pieces in the same slot keep the order they were sent in.
      .sort((a, b) => LAYER_ORDER.indexOf(a.slot) - LAYER_ORDER.indexOf(b.slot))
      .map((piece, zIndex) => ({ ...piece, zIndex }));

    return db.outfit.create({
      data: { userId, name, items: { create: pieces } },
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

  // GET /api/outfits/:id. 404 if it isn't the user's.
  async getOne(userId: string, id: string): Promise<SavedOutfit> {
    const outfit = await this.prisma.outfit.findFirst({
      where: { id, userId },
      include: WITH_PIECES,
    });
    if (!outfit) throw new NotFoundException({ message: 'Outfit not found' });
    return this.toSavedOutfit(outfit);
  }

  // PATCH /api/outfits/:id { isFavorite }. 404 if it isn't the user's.
  async setFavorite(userId: string, id: string, isFavorite: boolean): Promise<void> {
    const { count } = await this.prisma.outfit.updateMany({
      where: { id, userId },
      data: { isFavorite },
    });
    if (count === 0) throw new NotFoundException({ message: 'Outfit not found' });
  }

  // DELETE /api/outfits/:id. The database removes its OutfitItem,
  // CollectionOutfit and CalendarEntry rows with it (onDelete: Cascade).
  // 404 if it isn't the user's.
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.outfit.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException({ message: 'Outfit not found' });
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
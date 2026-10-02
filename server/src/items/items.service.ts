import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Item, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { CutoutService } from './cutout.service';
import type { UpdateItemDto } from './items.dto';
import { CATEGORY_TO_CLIENT, FIT_TO_CLIENT, categoryFromClient, fitFromClient } from './item-mappings';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly cutout: CutoutService,
  ) {}

  // Only the signed-in user's items, newest first.
  async listForUser(userId: User['id']) {
    const items = await this.prisma.item.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(items.map((item) => this.toClosetItem(item)));
  }

  // GET /api/items/:id — the full item.
  async getDetails(userId: User['id'], id: string) {
    const item = await this.findOwned(userId, id);
    return this.toItemDetails(item);
  }

  // PATCH /api/items/:id — change only the fields that were sent.
  async update(userId: User['id'], id: string, dto: UpdateItemDto) {
    await this.findOwned(userId, id);

    const data: Prisma.ItemUpdateInput = {};
    if (dto.isFavorite !== undefined) data.isFavorite = dto.isFavorite;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.colorHex !== undefined) data.colorHex = dto.colorHex;
    if (dto.category !== undefined) {
      data.category = dto.category === null ? null : categoryFromClient(dto.category);
    }
    if (dto.fit !== undefined) {
      data.fit = dto.fit === null ? null : fitFromClient(dto.fit);
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.cut !== undefined) data.cut = dto.cut;
    if (dto.pattern !== undefined) data.pattern = dto.pattern;
    if (dto.material !== undefined) data.material = dto.material;
    if (dto.season !== undefined) data.season = dto.season;
    if (dto.formality !== undefined) data.formality = dto.formality;

    const item = await this.prisma.item.update({ where: { id }, data });
    return this.toItemDetails(item);
  }

  // DELETE /api/items/:id — the item, every outfit/collection entry pointing at it, and its photos.
  async remove(userId: User['id'], id: string) {
    const item = await this.findOwned(userId, id);

    // All or nothing: outfits and collections never end up pointing at a deleted item.
    await this.prisma.$transaction([
      this.prisma.outfitItem.deleteMany({ where: { itemId: id } }),
      this.prisma.collectionItem.deleteMany({ where: { itemId: id } }),
      this.prisma.item.delete({ where: { id } }),
    ]);

    // Photos go after the database succeeds. A failed S3 delete only leaves an unused file.
    for (const key of [item.imageKey, item.cutoutKey]) {
      if (!key) continue;
      try {
        await this.s3.deleteObject(key);
      } catch (err) {
        this.logger.warn(`Could not delete ${key} from S3: ${(err as Error).message}`);
      }
    }
  }

  // Step 1 of adding an item: a presigned S3 URL the app uploads the photo to.
  async createPhotoUploadUrl(userId: User['id'], contentType: string) {
    const ext = this.s3.extensionFor(contentType);
    if (!ext) {
      throw new BadRequestException({ message: 'Only JPEG, PNG or WebP images are allowed' });
    }
    const key = this.s3.buildKey(userId, 'clothing', ext);
    const uploadUrl = await this.s3.getUploadUrl(key, contentType);
    return { uploadUrl, key };
  }

  // Step 3 of adding an item: save it once the photo is in S3, then cut it out.
  async createFromPhoto(userId: User['id'], key: string) {
    // Must be in this user's own folder, and the upload must have finished.
    // 404 either way, so nobody can probe other users' files.
    if (!key.startsWith(`users/${userId}/clothing/`) || !(await this.s3.objectExists(key))) {
      throw new NotFoundException({ message: 'Photo not found' });
    }

    // If the app retries after a timeout, don't create a duplicate item.
    const existing = await this.prisma.item.findFirst({ where: { userId, imageKey: key } });
    if (existing) return { itemId: existing.id };

    const item = await this.prisma.item.create({
      data: { userId, imageKey: key, colorHex: [] },
    });

    await this.addCutout(item.id, key);

    // Later: AI-tag the item here (category, type, colors, fit, name).

    return { itemId: item.id };
  }

  // The item, but only if it belongs to this user. 404 otherwise, so ids can't be probed.
  private async findOwned(userId: User['id'], id: string): Promise<Item> {
    const item = await this.prisma.item.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException({ message: 'Item not found' });
    return item;
  }

  // Removes the background and saves the cutout as a transparent PNG next to the original.
  // If anything fails, the item simply keeps showing the original photo.
  private async addCutout(itemId: Item['id'], key: string) {
    try {
      const original = await this.s3.getObjectBuffer(key);
      const cutoutPng = await this.cutout.removeBackground(original);
      const cutoutKey = key.replace(/\.(jpg|png|webp)$/, '-cutout.png');
      await this.s3.putObject(cutoutKey, cutoutPng, 'image/png');
      await this.prisma.item.update({ where: { id: itemId }, data: { cutoutKey } });
    } catch (err) {
      this.logger.warn(`Cutout failed for item ${itemId}: ${(err as Error).message}`);
    }
  }

  // Matches the app's ClosetItem type exactly.
  private async toClosetItem(item: Item) {
    return {
      id: item.id,
      name: item.name,
      category: item.category ? CATEGORY_TO_CLIENT[item.category] : null,
      // Cutout if it's ready, otherwise the original photo.
      imageUrl: await this.s3.getDownloadUrl(item.cutoutKey ?? item.imageKey),
      isFavorite: item.isFavorite,
    };
  }

  // Matches the app's ClothingItemDetails type. To add a field, add one line here.
  private async toItemDetails(item: Item) {
    return {
      ...(await this.toClosetItem(item)),
      type: item.type,
      cut: item.cut,
      colorHex: item.colorHex,
      pattern: item.pattern,
      material: item.material,
      season: item.season,
      formality: item.formality,
      fit: item.fit ? FIT_TO_CLIENT[item.fit] : null,
      sourceURL: item.sourceURL,
      createdAt: item.createdAt,
    };
  }
}
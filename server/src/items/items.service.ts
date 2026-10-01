import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Category, Item, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { CutoutService } from './cutout.service';

// Server enum value -> the app's ClothingCategory value (client/src/services/items.ts).
// If a category is ever added to the Prisma enum, TypeScript will error here until it's mapped.
const CATEGORY_TO_CLIENT: Record<Category, string> = {
  Top: 'tops',
  Bottoms: 'bottoms',
  Outerwear: 'outerwear',
  Shoes: 'shoes',
  Accessory: 'accessories',
  OnePiece: 'one-piece',
  Sets: 'sets',
};

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
}
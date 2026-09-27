import { Injectable } from '@nestjs/common';
import type { Category, Item, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // Only the signed-in user's items, newest first.
  async listForUser(userId: User['id']) {
    const items = await this.prisma.item.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(items.map((item) => this.toClosetItem(item)));
  }

  // Matches the app's ClosetItem type exactly.
  private async toClosetItem(item: Item) {
    return {
      id: item.id,
      name: item.name,
      category: CATEGORY_TO_CLIENT[item.category],
      // Cutout if it's ready, otherwise the original photo.
      imageUrl: await this.s3.getDownloadUrl(item.cutoutKey ?? item.imageKey),
      isFavorite: item.isFavorite,
    };
  }
}
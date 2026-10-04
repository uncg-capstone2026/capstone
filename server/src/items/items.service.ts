import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Item, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ImageProcessingService } from '../gemini/image-processing/service';
import { mimeTypeForKey } from '../gemini/helpers';
import { CutoutService } from './cutout.service';
import type { UpdateItemDto } from './items.dto';
import { CATEGORY_TO_CLIENT, FIT_TO_CLIENT, categoryFromClient, fitFromClient } from './item-mappings';
import { buildColorGrid } from './color-grid';

// The image the AI steps send to Gemini.
type AiImage = { image: Buffer; mimeType: string };

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly cutout: CutoutService,
    private readonly imageProcessing: ImageProcessingService,
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

  // GET /api/items/:id/color-grid — the color dropper's grid, built from the
  // cutout (or the original if there's no cutout yet).
  async getColorGrid(userId: User['id'], id: string) {
    const item = await this.findOwned(userId, id);
    const image = await this.s3.getObjectBuffer(item.cutoutKey ?? item.imageKey);
    return buildColorGrid(image);
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

    const cutoutPng = await this.addCutout(item.id, key);

    // AI steps (Gemini embedding + tagging): independent, so they run in parallel
    // on the same image. Each catches its own errors, so the item is still
    // created if either fails; missing embeddings/tags can be backfilled later.
    const aiImage = await this.loadAiImage(item.id, key, cutoutPng);
    if (aiImage) {
      await Promise.all([
        this.addEmbedding(item.id, aiImage),
        this.addAttributes(item.id, aiImage),
      ]);
    }

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
  // Returns the cutout so later steps can reuse it, or null if it failed.
  private async addCutout(itemId: Item['id'], key: string): Promise<Buffer | null> {
    try {
      const original = await this.s3.getObjectBuffer(key);
      const cutoutPng = await this.cutout.removeBackground(original);
      const cutoutKey = key.replace(/\.(jpg|png|webp)$/, '-cutout.png');
      await this.s3.putObject(cutoutKey, cutoutPng, 'image/png');
      await this.prisma.item.update({ where: { id: itemId }, data: { cutoutKey } });
      return cutoutPng;
    } catch (err) {
      this.logger.warn(`Cutout failed for item ${itemId}: ${(err as Error).message}`);
      return null;
    }
  }

  // AI (shared input): the image both AI steps read. The cutout if there is one
  // (already in memory), otherwise the original if it's PNG/JPEG. null means
  // there's nothing Gemini accepts, so both AI steps are skipped.
  private async loadAiImage(
    itemId: Item['id'],
    key: string,
    cutoutPng: Buffer | null,
  ): Promise<AiImage | null> {
    if (cutoutPng) return { image: cutoutPng, mimeType: 'image/png' };

    const mimeType = mimeTypeForKey(key);
    if (!mimeType) {
      this.logger.warn(`AI steps skipped for item ${itemId}: ${key} is not PNG or JPEG`);
      return null;
    }
    try {
      return { image: await this.s3.getObjectBuffer(key), mimeType };
    } catch (err) {
      this.logger.warn(`AI steps skipped for item ${itemId}: ${(err as Error).message}`);
      return null;
    }
  }

  // AI (Gemini embedding): turns the item's photo into a 768-number vector so the
  // Stylist can find it by meaning, via ImageProcessingService.embedImage, and
  // saves it to Item.embedding. If anything fails, the item is saved without one
  // and the Stylist skips it.
  private async addEmbedding(itemId: Item['id'], { image, mimeType }: AiImage) {
    // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
    const debugStartedAt = Date.now();
    this.logger.log(`[DEBUG AI] embedding start item=${itemId} mimeType=${mimeType} size=${Math.round(image.length / 1024)}KB`);
    // ==================== END TEST / DEBUG ====================
    try {
      const embedding = await this.imageProcessing.embedImage(image, mimeType);
      // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
      this.logger.log(`[DEBUG AI] embedding ok item=${itemId} in ${Date.now() - debugStartedAt}ms (dimensions=${embedding.length})`);
      // ==================== END TEST / DEBUG ====================
      // Prisma can't write the vector type, so it goes in as '[0.1,...]' text and is cast in SQL.
      const vector = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`UPDATE "Item" SET embedding = ${vector}::vector WHERE id = ${itemId}`;
    } catch (err) {
      this.logger.warn(`Embedding failed for item ${itemId}: ${(err as Error).message}`);
      // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
      this.debugLogAiError('embedding', itemId, err, debugStartedAt);
      // ==================== END TEST / DEBUG ====================
    }
  }

  // AI (Gemini tagging): reads the photo and fills in name, type, category, colors,
  // pattern, material, season, formality and fit via
  // ImageProcessingService.extractImageAttributes. If anything fails, the item keeps
  // its defaults and the user (or a backfill) fills them in.
  private async addAttributes(itemId: Item['id'], { image, mimeType }: AiImage) {
    // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
    const debugStartedAt = Date.now();
    this.logger.log(`[DEBUG AI] tagging start item=${itemId} mimeType=${mimeType} size=${Math.round(image.length / 1024)}KB`);
    // ==================== END TEST / DEBUG ====================
    try {
      const attrs = await this.imageProcessing.extractImageAttributes(image, mimeType);
      // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
      this.logger.log(`[DEBUG AI] tagging ok item=${itemId} in ${Date.now() - debugStartedAt}ms: ${JSON.stringify(attrs)}`);
      // ==================== END TEST / DEBUG ====================

      // Same length limits as editing an item (items.dto.ts).
      const name = attrs.name?.trim().slice(0, 60);
      const material = attrs.material?.trim().slice(0, 50) || null;

      await this.prisma.item.update({
        where: { id: itemId },
        data: {
          ...(name ? { name } : {}), // empty name keeps the "New item" default
          type: attrs.type,
          category: attrs.category,
          colorHex: attrs.colorHex.slice(0, 3),
          pattern: attrs.pattern ?? null,
          material,
          season: attrs.season ?? null,
          formality: attrs.formality ?? null,
          fit: attrs.fit ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Tagging failed for item ${itemId}: ${(err as Error).message}`);
      // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
      this.debugLogAiError('tagging', itemId, err, debugStartedAt);
      // ==================== END TEST / DEBUG ====================
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

  // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================

  // GET /api/items/:id/embedding — whether the item has an embedding saved.
  // Prisma can't read the vector column, so this checks it with raw SQL.
  async hasEmbedding(userId: User['id'], id: string) {
    await this.findOwned(userId, id);
    const [row] = await this.prisma.$queryRaw<{ hasEmbedding: boolean }[]>`
      SELECT embedding IS NOT NULL AS "hasEmbedding" FROM "Item" WHERE id = ${id}`;
    return { itemId: id, hasEmbedding: row.hasEmbedding };
  }

  // Logs everything about a failed AI step: timing, HTTP status, the full
  // err.cause chain (where "fetch failed" hides ECONNRESET etc.) and the stack.
  // Never logs the image or request body.
  private debugLogAiError(step: string, itemId: Item['id'], err: unknown, startedAt: number) {
    const e = err as Error & { status?: unknown; code?: unknown };
    const lines = [
      `[DEBUG AI] ${step} FAILED item=${itemId} after ${Date.now() - startedAt}ms`,
      `  error: ${e?.name}: ${e?.message} (status=${e?.status ?? '-'}, code=${e?.code ?? '-'})`,
    ];

    let cause = (err as { cause?: unknown })?.cause;
    for (let depth = 0; cause && depth < 5; depth++) {
      const c = cause as Error & Record<string, unknown>;
      const details = ['code', 'errno', 'syscall', 'address', 'port']
        .filter((k) => c[k] !== undefined)
        .map((k) => `${k}=${String(c[k])}`)
        .join(', ');
      lines.push(`  cause[${depth}]: ${c.name ?? typeof cause}: ${c.message ?? String(cause)}${details ? ` (${details})` : ''}`);
      cause = c.cause;
    }

    this.logger.error(lines.join('\n'), e?.stack);
  }
  // ==================== END TEST / DEBUG ====================
}
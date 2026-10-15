import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // Step 1: a presigned S3 URL the app uploads the body photo to.
  async createBodyUploadUrl(userId: User['id'], contentType: string) {
    const ext = this.s3.extensionFor(contentType);
    if (!ext) {
      throw new BadRequestException({ message: 'Only JPEG, PNG or WebP images are allowed' });
    }
    const key = this.s3.buildKey(userId, 'body', ext);
    const uploadUrl = await this.s3.getUploadUrl(key, contentType);
    return { uploadUrl, key };
  }

  // Step 3: save it as the user's try-on photo. The new photo replaces the old
  // one: the previous photos and their saved try-on images (TryOnRender) are
  // deleted, since try-on only ever uses the current photo.
  async saveBodyPhoto(userId: User['id'], key: string) {
    // Must be in this user's own folder, and the upload must have finished.
    if (!key.startsWith(`users/${userId}/body/`) || !(await this.s3.objectExists(key))) {
      throw new NotFoundException({ message: 'Photo not found' });
    }

    // If the app retries after a timeout, don't create a duplicate.
    const existing = await this.prisma.tryOnPhoto.findFirst({ where: { userId, imageKey: key } });
    if (existing) return { photoId: existing.id };

    // In one transaction, so a user never ends up with two photos or none.
    // Deleting the old photos also deletes their TryOnRender rows (cascade).
    const { photo, oldKeys } = await this.prisma.$transaction(async (tx) => {
      const oldPhotos = await tx.tryOnPhoto.findMany({
        where: { userId },
        select: { id: true, imageKey: true, renders: { select: { imageKey: true } } },
      });
      const photo = await tx.tryOnPhoto.create({
        data: { userId, imageKey: key, isPrimary: true },
      });
      if (oldPhotos.length > 0) {
        await tx.tryOnPhoto.deleteMany({ where: { id: { in: oldPhotos.map((old) => old.id) } } });
      }
      const oldKeys = oldPhotos.flatMap((old) => [old.imageKey, ...old.renders.map((render) => render.imageKey)]);
      return { photo, oldKeys };
    });

    // The files go after the database succeeds. A failed S3 delete only leaves
    // an unused file, so it's logged rather than failing the upload.
    if (oldKeys.length > 0) {
      const failed = await this.s3.deleteObjects([...new Set(oldKeys)]);
      if (failed.length > 0) {
        this.logger.warn(`New try-on photo saved for ${userId}, but ${failed.length} old S3 files weren't deleted: ${failed.join(', ')}`);
      }
    }

    return { photoId: photo.id };
  }

  // GET /api/photos/body -> { photoId, imageUrl } for the user's primary try-on
  // photo, or 404 if they haven't added one yet.
  async getPrimaryBodyPhoto(userId: User['id']) {
    const photo = await this.prisma.tryOnPhoto.findFirst({
      where: { userId, isPrimary: true },
      orderBy: { capturedAt: 'desc' }, // newest, just in case there were ever two
      select: { id: true, imageKey: true },
    });
    if (!photo) throw new NotFoundException({ message: 'No body photo yet' });
    return { photoId: photo.id, imageUrl: await this.s3.getDownloadUrl(photo.imageKey) };
  }
}
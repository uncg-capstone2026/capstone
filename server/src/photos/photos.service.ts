import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class PhotosService {
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

  // Step 3: save it as the user's primary try-on photo.
  async saveBodyPhoto(userId: User['id'], key: string) {
    // Must be in this user's own folder, and the upload must have finished.
    if (!key.startsWith(`users/${userId}/body/`) || !(await this.s3.objectExists(key))) {
      throw new NotFoundException({ message: 'Photo not found' });
    }

    // If the app retries after a timeout, don't create a duplicate.
    const existing = await this.prisma.tryOnPhoto.findFirst({ where: { userId, imageKey: key } });
    if (existing) return { photoId: existing.id };

    // The new photo becomes primary, and any previous primary photo stops being primary.
    // In one transaction, so a user never ends up with two primaries or none.
    const [, photo] = await this.prisma.$transaction([
      this.prisma.tryOnPhoto.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.tryOnPhoto.create({
        data: { userId, imageKey: key, isPrimary: true },
      }),
    ]);
    return { photoId: photo.id };
  }
}
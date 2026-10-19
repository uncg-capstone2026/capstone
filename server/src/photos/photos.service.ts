import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { TryOnService } from '../gemini/try-on/service';
import { BACK } from '../gemini/try-on/turnaround';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

// TryOnPhoto positions: the two the user uploads, the front (0) and the back
// (BACK). GenerateAngles adds the other angles, and replaces the back
// with one that lines up with the front.
const FRONT = 0;

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly tryOn: TryOnService,
  ) {}

  // Step 1: a presigned S3 URL the app uploads a body photo to.
  async createBodyUploadUrl(userId: User['id'], contentType: string) {
    const ext = this.s3.extensionFor(contentType);
    if (!ext) {
      throw new BadRequestException({ message: 'Only JPEG, PNG or WebP images are allowed' });
    }
    const key = this.s3.buildKey(userId, 'body', ext);
    const uploadUrl = await this.s3.getUploadUrl(key, contentType);
    return { uploadUrl, key };
  }

  // Step 3: save the front and back as the user's try-on photos. They replace
  // the old ones: the previous photos (front, back and generated angles) and
  // their saved try-on images (TryOnRender) are deleted. Then the other angles
  // are made in the background.
  async saveBodyPhotos(userId: User['id'], frontKey: string, backKey: string) {
    if (frontKey === backKey) {
      throw new BadRequestException({ message: 'The front and back photos must be different uploads' });
    }

    // If the app retries after a timeout, don't replace the photos again.
    const existing = await this.prisma.tryOnPhoto.findFirst({
      where: { userId, position: FRONT, imageKey: frontKey },
      select: { id: true },
    });
    if (existing) return { photoId: existing.id };

    // Both must be in this user's own folder, and both uploads must have finished.
    await Promise.all([frontKey, backKey].map((key) => this.checkUpload(userId, key)));

    // One transaction, so the user always has a full set of photos: either the
    // old ones or the new front and back. The old rows are deleted before the
    // new ones are created, since (userId, position) is unique. Deleting a
    // photo also deletes its TryOnRender rows (cascade).
    const { front, oldKeys } = await this.prisma.$transaction(async (tx) => {
      const oldPhotos = await tx.tryOnPhoto.findMany({
        where: { userId },
        select: { imageKey: true, renders: { select: { imageKey: true } } },
      });
      await tx.tryOnPhoto.deleteMany({ where: { userId } });

      const front = await tx.tryOnPhoto.create({
        data: { userId, imageKey: frontKey, position: FRONT, isPrimary: true },
        select: { id: true },
      });
      await tx.tryOnPhoto.create({
        data: { userId, imageKey: backKey, position: BACK },
      });

      // The old files to delete from S3: every old photo and saved try-on image,
      // except the new front and back. Before, if the app sent a key that an old
      // photo already used (e.g. re-sending the current front as the new back),
      // that file was on the delete list too, so the new photo would point to a
      // file that no longer existed.
      const oldKeys = oldPhotos
        .flatMap((old) => [old.imageKey, ...old.renders.map((render) => render.imageKey)])
        .filter((key) => key !== frontKey && key !== backKey);
      return { front, oldKeys };
    });

    // The files go after the database succeeds. A failed S3 delete only leaves
    // an unused file, so it's logged rather than failing the upload.
    if (oldKeys.length > 0) {
      const failed = await this.s3.deleteObjects([...new Set(oldKeys)]);
      if (failed.length > 0) {
        this.logger.warn(`New try-on photos saved for ${userId}, but ${failed.length} old S3 files weren't deleted: ${failed.join(', ')}`);
      }
    }

    // AI (Gemini image generation): makes the other angles from the front and
    // back. Not awaited: it takes a while, and it logs its own failures.
    void this.tryOn.generateAngles(userId, front.id);

    return { photoId: front.id };
  }

  // GET /api/photos/body -> { photoId, imageUrl, anglesReady, needsRetake } for
  // the user's front photo, or 404 if they haven't added one yet.
  async getBodyPhoto(userId: User['id']) {
    const photos = await this.prisma.tryOnPhoto.findMany({
      where: { userId },
      select: { id: true, imageKey: true, position: true },
    });
    const front = photos.find((photo) => photo.position === FRONT);
    if (!front) throw new NotFoundException({ message: 'No body photo yet' });

    return {
      photoId: front.id,
      imageUrl: await this.s3.getDownloadUrl(front.imageKey),
      // The front and back are the only rows until generateAngles saves the rest.
      anglesReady: photos.length > 2,
      needsRetake: !photos.some((photo) => photo.position === BACK),
    };
  }

  // 404 unless the key is in this user's body folder and the upload finished.
  private async checkUpload(userId: User['id'], key: string) {
    if (!key.startsWith(`users/${userId}/body/`) || !(await this.s3.objectExists(key))) {
      throw new NotFoundException({ message: 'Photo not found' });
    }
  }
}
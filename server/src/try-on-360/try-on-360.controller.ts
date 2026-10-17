import {
  BadRequestException, Body, Controller, HttpCode, Post, UploadedFiles, UseGuards, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { S3Service } from '../s3/s3.service';
import { TryOn360Dto } from './try-on-360.dto';
import { TryOn360Service } from './try-on-360.service';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const limits = { fileSize: MAX_PHOTO_BYTES };

// transform: itemIds arrives as "id1,id2" and is split by the DTO.
const validate = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

// The parts of a multer file used here (@types/multer isn't installed).
type UploadedPhoto = { buffer: Buffer; mimetype: string };
type Files = Record<string, UploadedPhoto[] | undefined> | undefined;

// angle0 … angle11: one base view per position.
const SLOTS = Array.from({ length: 12 }, (_, i) => `angle${i}`);

// ---- Test routes only ----
// For trying the 360° try-on on any photos, without uploading try-on photos
// first. The app uses POST /api/stylist/try-on. Delete src/try-on-360/ and its
// import in app.module.ts to remove them.
// Every route is multipart/form-data and returns
//   { runId, totalMs, frames: [{ position, angle, imageUrl, round, ms, error? }] }
// with 12 frames 30° apart. A failed frame has imageUrl null and an error;
// 422/503 when frame 0 fails, since the others are made from it.
@Controller('stylist')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class TryOn360Controller {
  constructor(
    private readonly service: TryOn360Service,
    private readonly s3: S3Service,
  ) {}

  // POST /api/stylist/try-on-360/base: front, back (images)
  // 12 views of the user in their own clothes, in the front photo's pose.
  // Frame 0 is the front photo; the other 11 are made from it and the back
  // photo, in parallel. 400 bad photo.
  @Post('try-on-360/base')
  @HttpCode(200)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }], { limits }))
  base(@CurrentUserId() userId: User['id'], @UploadedFiles() files: Files) {
    return this.service.generateBase(userId, this.photo(files, 'front'), this.photo(files, 'back'));
  }

  // POST /api/stylist/try-on-360: angle0 … angle11 (images), itemIds ("id1,id2")
  // The base views dressed in the outfit: angle0 first, then the other 11 in
  // parallel, each from its base view and the dressed front. angle0 is
  // required; a missing slot comes back as a failed frame. 400 bad photo or
  // itemIds; 404 an item isn't in the closet.
  @Post('try-on-360')
  @HttpCode(200)
  @UseInterceptors(FileFieldsInterceptor(SLOTS.map((name) => ({ name, maxCount: 1 })), { limits }))
  dress(@CurrentUserId() userId: User['id'], @UploadedFiles() files: Files, @Body(validate) body: TryOn360Dto) {
    const slots = SLOTS.map((name, i) => (i === 0 || files?.[name]?.[0] ? this.photo(files, name) : undefined));
    return this.service.dress(userId, slots, body.itemIds);
  }

  // POST /api/stylist/try-on-360/direct: front, back (images), itemIds ("id1,id2")
  // Turns and dresses at once: the front, then the other 11 in parallel from
  // the dressed front and the back photo. 400 bad photo or itemIds; 404 an
  // item isn't in the closet.
  @Post('try-on-360/direct')
  @HttpCode(200)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }], { limits }))
  direct(@CurrentUserId() userId: User['id'], @UploadedFiles() files: Files, @Body(validate) body: TryOn360Dto) {
    return this.service.generate360(userId, this.photo(files, 'front'), this.photo(files, 'back'), body.itemIds);
  }

  // The uploaded image in `field`; 400 when it's missing or not an image.
  private photo(files: Files, field: string): Buffer {
    const file = files?.[field]?.[0];
    if (!file || !this.s3.extensionFor(file.mimetype)) {
      throw new BadRequestException({ message: `${field} must be a JPEG, PNG or WebP image` });
    }
    return file.buffer;
  }
}

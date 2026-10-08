import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { PhotoUploadUrlDto, SaveBodyPhotoDto } from './photos.dto';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  // GET /api/photos/body -> { photoId, imageUrl }, or 404 if there's no body photo yet
  @Get('body')
  getBody(@CurrentUserId() userId: User['id']) {
    return this.photos.getPrimaryBodyPhoto(userId);
  }

  // POST /api/photos/body/upload-url { contentType, fileName } -> { uploadUrl, key }
  @Post('body/upload-url')
  bodyUploadUrl(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: PhotoUploadUrlDto,
  ) {
    return this.photos.createBodyUploadUrl(userId, body.contentType);
  }

  // POST /api/photos/body { key } -> { photoId }
  @Post('body')
  saveBody(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: SaveBodyPhotoDto,
  ) {
    return this.photos.saveBodyPhoto(userId, body.key);
  }
}
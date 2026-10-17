import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { PhotoUploadUrlDto, SaveBodyPhotosDto } from './photos.dto';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  // GET /api/photos/body -> { photoId, imageUrl, anglesReady, needsRetake },
  // or 404 if there's no body photo yet. photoId and imageUrl are the front.
  // anglesReady: the other angles have been made, so try-on shows the full spin.
  // needsRetake: there's no back photo (an upload from before front + back),
  // so try-on won't work until they upload both again.
  @Get('body')
  getBody(@CurrentUserId() userId: User['id']) {
    return this.photos.getBodyPhoto(userId);
  }

  // POST /api/photos/body/upload-url { contentType, fileName } -> { uploadUrl, key }
  // Called once for the front and once for the back.
  @Post('body/upload-url')
  bodyUploadUrl(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: PhotoUploadUrlDto,
  ) {
    return this.photos.createBodyUploadUrl(userId, body.contentType);
  }

  // POST /api/photos/body { frontKey, backKey } -> { photoId }
  // Replaces the user's try-on photos, then makes the other angles in the
  // background (anglesReady turns true on GET when they're done). 400 if the
  // two keys are the same, 404 if either upload isn't finished.
  @Post('body')
  saveBody(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: SaveBodyPhotosDto,
  ) {
    return this.photos.saveBodyPhotos(userId, body.frontKey, body.backKey);
  }
}
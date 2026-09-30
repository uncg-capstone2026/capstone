import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { PhotoUploadUrlDto, SavePhotoDto } from './items.dto';
import { ItemsService } from './items.service';

@Controller('items')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  // GET /api/items -> ClosetItem[] for the logged-in user
  @Get()
  list(@CurrentUserId() userId: User['id']) {
    return this.items.listForUser(userId);
  }

  // POST /api/items/photo/upload-url { contentType, fileName } -> { uploadUrl, key }
  @Post('photo/upload-url')
  photoUploadUrl(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: PhotoUploadUrlDto,
  ) {
    return this.items.createPhotoUploadUrl(userId, body.contentType);
  }

  // POST /api/items/photo { key } -> { itemId }
  @Post('photo')
  savePhoto(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: SavePhotoDto,
  ) {
    return this.items.createFromPhoto(userId, body.key);
  }
}
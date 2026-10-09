import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards, ValidationPipe,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ImportLinkDto, PhotoUploadUrlDto, SavePhotoDto, UpdateItemDto } from './items.dto';
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

  // GET /api/items/:id -> the full item
  @Get(':id')
  details(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.items.getDetails(userId, id);
  }

  // GET /api/items/:id/color-grid -> { width, height, pixels } for the color dropper
  @Get(':id/color-grid')
  colorGrid(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.items.getColorGrid(userId, id);
  }

  // PATCH /api/items/:id { ...fields to change } -> the updated item
  @Patch(':id')
  update(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    // whitelist + forbidNonWhitelisted: unknown fields (e.g. userId, imageKey) are rejected.
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) body: UpdateItemDto,
  ) {
    return this.items.update(userId, id, body);
  }

  // DELETE /api/items/:id -> 204 No Content
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.items.remove(userId, id);
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

  // POST /api/items/link { url } -> { itemId, isNew }. 400 with a message if it can't be imported.  
  @Post('link')
  importLink(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: ImportLinkDto,
  ) {
    return this.items.createFromLink(userId, body.url);
  }

  // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================

  // GET /api/items/:id/embedding -> { itemId, hasEmbedding }
  @Get(':id/embedding')
  hasEmbedding(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.items.hasEmbedding(userId, id);
  }

  // ==================== END TEST / DEBUG ====================
}
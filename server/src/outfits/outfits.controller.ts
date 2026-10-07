import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards, ValidationPipe,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { CreateOutfitDto, UpdateOutfitDto } from './outfits.dto';
import { OutfitsService } from './outfits.service';

// whitelist + forbidNonWhitelisted: unknown fields (e.g. userId) are rejected.
const validate = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller('outfits')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class OutfitsController {
  constructor(private readonly outfits: OutfitsService) {}

  // POST /api/outfits { name, itemIds } -> the new outfit (SavedOutfit)
  @Post()
  async create(@CurrentUserId() userId: User['id'], @Body(validate) body: CreateOutfitDto) {
    const { id } = await this.outfits.create(userId, body);
    return this.outfits.getOne(userId, id);
  }

  // GET /api/outfits -> SavedOutfit[], newest first. ?favorite=true for favorites only.
  @Get()
  list(@CurrentUserId() userId: User['id'], @Query('favorite') favorite?: string) {
    return this.outfits.list(userId, favorite === 'true');
  }

  // GET /api/outfits/:id -> SavedOutfit
  @Get(':id')
  getOne(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.outfits.getOne(userId, id);
  }

  // PATCH /api/outfits/:id { isFavorite } -> 204
  @Patch(':id')
  @HttpCode(204)
  update(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Body(validate) body: UpdateOutfitDto,
  ) {
    return this.outfits.setFavorite(userId, id, body.isFavorite);
  }

  // DELETE /api/outfits/:id -> 204. Also removes it from collections and the calendar.
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.outfits.remove(userId, id);
  }
}
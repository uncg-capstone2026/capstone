import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards, ValidationPipe,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { CreateOutfitDto, ScheduleOutfitDto, UpdateOutfitDto } from './outfits.dto';
import { OutfitsService } from './outfits.service';

// whitelist + forbidNonWhitelisted: unknown fields (e.g. userId) are rejected.
const validate = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller('outfits')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class OutfitsController {
  constructor(private readonly outfits: OutfitsService) {}

  // POST /api/outfits { name, itemIds } -> the new outfit (with scheduled and collections)
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

  // GET /api/outfits/:id -> SavedOutfit plus scheduled[] and collections[]
  @Get(':id')
  getOne(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.outfits.getOne(userId, id);
  }

  // PATCH /api/outfits/:id { isFavorite?, itemIds? } -> the updated outfit
  // 400 if neither is sent, or the new pieces aren't a complete outfit.
  @Patch(':id')
  update(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Body(validate) body: UpdateOutfitDto,
  ) {
    return this.outfits.update(userId, id, body);
  }

  // DELETE /api/outfits/:id -> 204. Also removes it from collections and the calendar.
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.outfits.remove(userId, id);
  }

  // POST /api/outfits/:id/schedule { date, eventName? } -> { id, date, eventName }
  @Post(':id/schedule')
  schedule(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Body(validate) body: ScheduleOutfitDto,
  ) {
    return this.outfits.schedule(userId, id, body);
  }

  // DELETE /api/outfits/:id/schedule/:entryId -> 204
  @Delete(':id/schedule/:entryId')
  @HttpCode(204)
  unschedule(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    return this.outfits.unschedule(userId, id, entryId);
  }
}
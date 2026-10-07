import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards, ValidationPipe,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { AddOutfitsDto, CollectionNameDto } from './collections.dto';
import { CollectionsService } from './collections.service';

// whitelist + forbidNonWhitelisted: unknown fields (e.g. userId) are rejected.
const validate = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller('collections')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  // GET /api/collections -> { allOutfits, favorites, collections } (OutfitsOverview)
  @Get()
  overview(@CurrentUserId() userId: User['id']) {
    return this.collections.overview(userId);
  }

  // POST /api/collections { name } -> { id, name, outfitCount: 0, cover: null }
  // 400 if the name isn't 1-40 characters, 409 if the user already has it.
  @Post()
  create(@CurrentUserId() userId: User['id'], @Body(validate) body: CollectionNameDto) {
    return this.collections.create(userId, body.name);
  }

  // GET /api/collections/:id -> { id, name, outfits }
  @Get(':id')
  details(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.collections.details(userId, id);
  }

  // PATCH /api/collections/:id { name } -> the renamed collection. Same 400/409 rules.
  @Patch(':id')
  rename(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Body(validate) body: CollectionNameDto,
  ) {
    return this.collections.rename(userId, id, body.name);
  }

  // DELETE /api/collections/:id -> 204. Its outfits stay in All saved outfits.
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.collections.remove(userId, id);
  }

  // POST /api/collections/:id/outfits { outfitIds } -> 204
  @Post(':id/outfits')
  @HttpCode(204)
  addOutfits(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Body(validate) body: AddOutfitsDto,
  ) {
    return this.collections.addOutfits(userId, id, body.outfitIds);
  }

  // DELETE /api/collections/:id/outfits/:outfitId -> 204. The outfit itself stays.
  @Delete(':id/outfits/:outfitId')
  @HttpCode(204)
  removeOutfit(
    @CurrentUserId() userId: User['id'],
    @Param('id') id: string,
    @Param('outfitId') outfitId: string,
  ) {
    return this.collections.removeOutfit(userId, id, outfitId);
  }
}
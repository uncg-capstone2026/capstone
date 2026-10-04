import { Body, Controller, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { StyleOutfitDto } from './stylist.dto';
import { StylistService } from './stylist.service';

@Controller('stylist')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class StylistController {
  constructor(private readonly stylist: StylistService) {}

  // POST /api/stylist/outfit { date, occasion, excludeSuggestionIds?, lat?, lon? }
  //   -> { suggestionId, name, reasons, items: { id, name, category, type, imageUrl }[] }
  // Nothing is saved ("This chat isn't saved").
  @Post('outfit')
  @HttpCode(200)
  outfit(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) body: StyleOutfitDto,
  ) {
    return this.stylist.suggestOutfit(userId, body);
  }
}
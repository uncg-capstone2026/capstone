import { Body, Controller, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { StyleOutfitDto } from './stylist.dto';
import { StylistService } from './stylist.service';

@Controller('stylist')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class StylistController {
  constructor(private readonly stylist: StylistService) {}

  // POST /api/stylist/outfit { occasion, date? }
  //   -> { name, reason, items: [{ itemId, name, category, type, imageUrl }] }
  // 422 when the closet doesn't have enough matching items for a complete outfit.
  @Post('outfit')
  @HttpCode(200)
  outfit(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: StyleOutfitDto,
  ) {
    const userRequest = body.date ? `${body.occasion}\nDate: ${body.date}` : body.occasion;
    return this.stylist.planOutfit(userId, userRequest);
  }
}
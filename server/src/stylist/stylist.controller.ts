import { Body, Controller, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { AcceptOutfitDto, OutfitFeedbackDto } from './outfit-feedback.dto';
import { OutfitFeedbackService } from './outfit-feedback.service';
import { StyleOutfitDto } from './stylist.dto';
import { StylistService } from './stylist.service';

// whitelist + forbidNonWhitelisted: unknown fields (e.g. userId) are rejected.
const validate = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller('stylist')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class StylistController {
  constructor(
    private readonly stylist: StylistService,
    private readonly feedback: OutfitFeedbackService,
  ) {}

  // POST /api/stylist/outfit { occasion, date?, excludeSuggestionIds? }
  //   -> { suggestionId, name, reasons, items: [{ id, name, category, type, imageUrl }] }
  // Matches OutfitSuggestion in client/src/services/stylist.ts.
  // 422 when the closet doesn't have enough matching items for a complete outfit,
  // or every outfit it can find has already been shown.
  @Post('outfit')
  @HttpCode(200)
  outfit(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: StyleOutfitDto,
  ) {
    const userRequest = body.date ? `${body.occasion}\nDate: ${body.date}` : body.occasion;
    return this.stylist.suggestOutfit(userId, userRequest, body.excludeSuggestionIds ?? []);
  }

  // POST /api/stylist/outfit/accept { suggestionId, itemIds, name, eventName, date } -> { outfitId }
  // "Looks right": saves the Outfit and a CalendarEntry for date, together.
  @Post('outfit/accept')
  accept(@CurrentUserId() userId: User['id'], @Body(validate) body: AcceptOutfitDto) {
    return this.feedback.accept(userId, body);
  }

  // POST /api/stylist/outfit/feedback { suggestionId, itemIds, feedback } -> 204
  // "Not for me": saves the answer to Style Preferences.
  @Post('outfit/feedback')
  @HttpCode(204)
  reject(@CurrentUserId() userId: User['id'], @Body(validate) body: OutfitFeedbackDto) {
    return this.feedback.reject(userId, body);
  }
}
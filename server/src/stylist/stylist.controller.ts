import { Body, Controller, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { AcceptOutfitDto, OutfitFeedbackDto } from './outfit-feedback.dto';
import { OutfitFeedbackService } from './outfit-feedback.service';
import { RepromptDto, StyleOutfitDto, TryOnDto } from './stylist.dto';
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

  // POST /api/stylist/outfit { occasion, date?, lat?, lon? }
  //   -> { sessionId, turnId, suggestionId, name, reasons, items: [{ id, name, category, type, imageUrl }] }
  // Starts a session; "Try another" and other feedback go to /outfit/reprompt.
  // Matches OutfitSuggestion in client/src/services/stylist.ts (plus sessionId
  // and turnId). 422 when the closet doesn't have enough matching items for a
  // complete outfit. 503 when the AI is unavailable.
  @Post('outfit')
  @HttpCode(200)
  outfit(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: StyleOutfitDto,
  ) {
    const location = body.lat !== undefined && body.lon !== undefined
      ? { lat: body.lat, lon: body.lon }
      : null;
    return this.stylist.startSession(userId, {
      occasion: body.occasion,
      date: body.date,
      location,
    });
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

  // POST /api/stylist/outfit/reprompt { sessionId, message? } -> same shape as /outfit.
  // No message (or an empty one) is "Try another". 404 if the session isn't
  // the user's, 409 if it's finished or another reprompt is in progress,
  // 422 when there's nothing new to suggest or the turn limit is reached.
  @Post('outfit/reprompt')
  @HttpCode(200)
  reprompt(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe()) body: RepromptDto,
  ) {
    return this.stylist.reprompt(userId, body.sessionId, body.message ?? '');
  }

  // POST /api/stylist/try-on { itemIds }
  //   -> { imageUrl, frames: [{ position, angle, imageUrl }] }
  // The user wearing the outfit on screen, from 12 angles (TryOnResult in
  // gemini/try-on/service.ts). imageUrl is frame 0 (the front). Frames are
  // positions 0-11, angle = position x 30; a frame's imageUrl is null when that
  // angle isn't ready yet or failed. URLs are signed for 24 hours. Saved images
  // are reused when the same items are tried on again.
  // 404 when they haven't uploaded try-on photos, only have an old front photo
  // (retake front and back), or an item isn't in their closet (show message).
  // 422 when the photo can't be used (show message). 503 when the AI is unavailable.
  @Post('try-on')
  @HttpCode(200)
  tryOn(@CurrentUserId() userId: User['id'], @Body(validate) body: TryOnDto) {
    return this.stylist.tryOn(userId, body.itemIds);
  }
}
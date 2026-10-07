import { Injectable, Logger } from '@nestjs/common';
import { OutfitsService } from '../outfits/outfits.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptOutfitDto, OutfitFeedbackDto } from './outfit-feedback.dto';

// "Looks right" and "Not for me" on the Stylist's suggestion screen. Both are
// recorded in StyleFeedback, which the outfit prompt can learn from (Javier).
@Injectable()
export class OutfitFeedbackService {
  private readonly logger = new Logger(OutfitFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outfits: OutfitsService,
  ) {}

  // POST /api/stylist/outfit/accept -> { outfitId }
  // Saves the outfit and its CalendarEntry together: if either fails, neither
  // is saved. 404 (from OutfitsService) if any item isn't the user's.
  async accept(userId: string, dto: AcceptOutfitDto): Promise<{ outfitId: string }> {
    const eventName = dto.eventName.trim() || null;

    const outfitId = await this.prisma.$transaction(async (tx) => {
      const { id } = await this.outfits.create(userId, { name: dto.name, itemIds: dto.itemIds }, tx);
      await tx.calendarEntry.create({
        data: { outfitId: id, date: dayToDate(dto.date), eventName },
      });
      return id;
    });

    // After the transaction: a failed log shouldn't undo a saved outfit.
    await this.record(userId, {
      kind: 'Accepted',
      suggestionId: dto.suggestionId,
      itemIds: dto.itemIds,
      outfitId,
      feedback: null,
    });

    return { outfitId };
  }

  // POST /api/stylist/outfit/feedback -> 204
  // Saves the user's answer to "What would you rather wear?" (may be empty).
  async reject(userId: string, dto: OutfitFeedbackDto): Promise<void> {
    await this.prisma.styleFeedback.create({
      data: {
        userId,
        kind: 'Rejected',
        suggestionId: dto.suggestionId,
        itemIds: dto.itemIds,
        feedback: dto.feedback.trim() || null,
      },
    });
  }

  // ---- Helpers ----

  private async record(
    userId: string,
    entry: { kind: 'Accepted' | 'Rejected'; suggestionId: string; itemIds: string[]; outfitId: string | null; feedback: string | null },
  ): Promise<void> {
    try {
      await this.prisma.styleFeedback.create({ data: { userId, ...entry } });
    } catch (err) {
      this.logger.warn(`Could not record ${entry.kind} feedback: ${(err as Error).message}`);
    }
  }
}

// 'YYYY-MM-DD' -> midnight UTC of that day. CalendarEntry.date is compared by
// its date part (date::date), so the day is what matters, not the time.
function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
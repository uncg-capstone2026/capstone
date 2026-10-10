import { BadRequestException, Injectable } from '@nestjs/common';
import { dateToDay, dayToDate } from '../outfits/calendar-day';
import { OutfitsService, WITH_PIECES, type SavedOutfit } from '../outfits/outfits.service';
import { PrismaService } from '../prisma/prisma.service';

// One planned day with its outfit. Matches CalendarEntry in client/src/services/calendar.ts.
export type CalendarDay = {
  id: string; // the calendar entry's id
  date: string; // YYYY-MM-DD
  eventName: string | null;
  outfit: SavedOutfit;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366; // enough for any month or year view

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outfits: OutfitsService,
  ) {}

  // GET /api/calendar?from&to: the user's planned days from `from` to `to`
  // (both included), earliest first. 400 for dates that don't exist, `from`
  // after `to`, or a range longer than a year.
  async range(userId: string, from: string, to: string): Promise<CalendarDay[]> {
    const start = dayToDate(from); // 400 for days like 2026-02-31
    const end = dayToDate(to);
    if (start > end) throw new BadRequestException({ message: 'from must be on or before to' });
    if ((end.getTime() - start.getTime()) / DAY_MS >= MAX_RANGE_DAYS) {
      throw new BadRequestException({ message: `The range can be at most ${MAX_RANGE_DAYS} days` });
    }

    // Days are stored as midnight UTC, so "before the day after `to`" includes
    // all of `to`, even if a time ever gets stored with one.
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        outfit: { userId },
        date: { gte: start, lt: new Date(end.getTime() + DAY_MS) },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: { outfit: { include: WITH_PIECES } },
    });

    return Promise.all(
      entries.map(async (entry) => ({
        id: entry.id,
        date: dateToDay(entry.date),
        eventName: entry.eventName,
        outfit: await this.outfits.toSavedOutfit(entry.outfit),
      })),
    );
  }
}
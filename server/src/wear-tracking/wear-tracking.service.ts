import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// How many calendar entries to look at per batch, and the most batches per run,
// so one run can't go on forever. Anything left over is picked up next hour.
const BATCH_SIZE = 200;
const MAX_BATCHES = 50;

// Counts outfits as worn once their calendar day has passed in the user's own
// time zone, and resets each item's 30-day "this month" count.
//
// Runs at the start of every hour, and once when the server starts (so days
// missed while it was down are still counted). Safe to run on several server
// instances at once: each entry is "claimed" before it's counted, so it can
// never be counted twice.
@Injectable()
export class WearTrackingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WearTrackingService.name);
  private running = false; // stops this instance overlapping with itself

  constructor(private readonly prisma: PrismaService) {}

  // In the background, so it doesn't slow down server startup.
  onApplicationBootstrap() {
    void this.run('startup');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    await this.run('hourly');
  }

  async run(trigger: 'startup' | 'hourly'): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Reset first, so new wears always land in the current period.
      const reset = await this.resetExpiredPeriods();
      const counted = await this.countPastEntries();
      if (reset > 0 || counted > 0) {
        this.logger.log(`Wear tracking (${trigger}): reset ${reset} item period(s), counted ${counted} calendar entr${counted === 1 ? 'y' : 'ies'}`);
      }
    } catch (err) {
      this.logger.error(`Wear tracking (${trigger}) failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // ---- Step 1: the 30-day reset ----

  // Items whose 30-day period has run out: count back to 0, and the period
  // moved forward by whole 30-day steps so it stays lined up with the item's
  // creation date, even if some hours or days were missed. Returns how many.
  private resetExpiredPeriods(): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "Item"
      SET "timesWornThisMonth" = 0,
          ${ROLL_FORWARD}
      WHERE "wearPeriodStart" <= ${NOW_UTC} - interval '30 days'
    `;
  }

  // ---- Step 2: claim and count past calendar entries ----

  // Counts every calendar entry whose day is before today in its user's time
  // zone and hasn't been counted yet. Returns how many were counted.
  private async countPastEntries(): Promise<number> {
    let counted = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      // CalendarEntry.date is stored as midnight UTC of the planned day, so its
      // date part is that day. Compared to "today" where the user lives.
      const due = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT ce.id
        FROM "CalendarEntry" ce
        JOIN "Outfit" o ON o.id = ce."outfitId"
        JOIN "User" u ON u.id = o."userId"
        WHERE ce."wornCountedAt" IS NULL
          AND ce."date"::date < (now() AT TIME ZONE u."timeZone")::date
        ORDER BY ce."date"
        LIMIT ${BATCH_SIZE}
      `;
      for (const { id } of due) {
        try {
          if (await this.countEntry(id)) counted++;
        } catch (err) {
          // One bad entry shouldn't stop the rest; it's retried next run.
          this.logger.warn(`Could not count calendar entry ${id}: ${(err as Error).message}`);
        }
      }
      if (due.length < BATCH_SIZE) break;
    }
    return counted;
  }

  // Counts one entry, all in one transaction. Returns false if another run had
  // already claimed it.
  private countEntry(entryId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Claim it. 0 rows updated means someone else already counted it.
      const claimed = await tx.calendarEntry.updateMany({
        where: { id: entryId, wornCountedAt: null },
        data: { wornCountedAt: new Date() },
      });
      if (claimed.count === 0) return false;

      const entry = await tx.calendarEntry.findUniqueOrThrow({
        where: { id: entryId },
        select: { date: true, outfitId: true, outfit: { select: { items: { select: { itemId: true } } } } },
      });

      // 2. The outfit: one more wear, and lastWorn moves to this day if it's
      // later. (GREATEST skips NULL, so the first wear just sets it.)
      await tx.$executeRaw`
        UPDATE "Outfit"
        SET "timesWorn" = "timesWorn" + 1,
            "lastWorn" = GREATEST("lastWorn", ${entry.date})
        WHERE id = ${entry.outfitId}
      `;

      // 3. Each of its items once, even if an item is in the outfit twice.
      const itemIds = [...new Set(entry.outfit.items.map((piece) => piece.itemId))];
      if (itemIds.length > 0) {
        // Roll any expired period forward first, so the wear lands in the current one.
        await tx.$executeRaw`
          UPDATE "Item"
          SET "timesWornThisMonth" = 0,
              ${ROLL_FORWARD}
          WHERE id IN (${Prisma.join(itemIds)})
            AND "wearPeriodStart" <= ${NOW_UTC} - interval '30 days'
        `;
        await tx.item.updateMany({
          where: { id: { in: itemIds } },
          data: { timesWorn: { increment: 1 }, timesWornThisMonth: { increment: 1 } },
        });
      }
      return true;
    });
  }
}

// "Now" in UTC without a time zone, matching how Prisma stores DateTime columns.
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

// Moves wearPeriodStart forward by as many whole 30-day periods as have passed
// (2592000 seconds = 30 days).
const ROLL_FORWARD = Prisma.sql`"wearPeriodStart" = "wearPeriodStart"
  + floor(extract(epoch from (${NOW_UTC} - "wearPeriodStart")) / 2592000) * interval '30 days'`;
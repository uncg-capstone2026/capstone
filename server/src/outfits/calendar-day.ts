import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// CalendarEntry.date holds a day, stored as midnight UTC of that day. These
// convert between that and the app's 'YYYY-MM-DD'.

// 'YYYY-MM-DD' -> Date. 400 for days that don't exist, like 2026-02-31.
export function dayToDate(day: string): Date {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || dateToDay(date) !== day) {
    throw new BadRequestException({ message: `${day} isn't a real date` });
  }
  return date;
}

// Date -> 'YYYY-MM-DD'.
export function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// SQL condition, for an UPDATE on "Item": the calendar day `date` falls in the
// item's current 30-day wear period, so its wear belongs in timesWornThisMonth.
// The day counts if any part of it is in the period (it ends after the period
// starts). Used both when a wear is counted and when it's taken back off, so
// the two always agree.
export function inCurrentWearPeriod(date: Date): Prisma.Sql {
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return Prisma.sql`"wearPeriodStart" < ${dayEnd}`;
}
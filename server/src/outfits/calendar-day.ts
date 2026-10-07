import { BadRequestException } from '@nestjs/common';

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
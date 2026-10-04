export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Local YYYY-MM-DD. Not toISOString(), which is UTC and gives tomorrow's date on a US evening.
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Whole days from today to `date` (0 for today, negative for past days).
export function daysFromToday(date: Date): number {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return Math.round((day.getTime() - startOfToday().getTime()) / (24 * 60 * 60 * 1000));
}

export function isToday(date: Date): boolean {
  return toDateKey(date) === toDateKey(new Date());
}

// "Today · Wed, Sep 30", "Tomorrow · Thu, Oct 1", or "Fri, Oct 2".
export function formatDayLabel(date: Date): string {
  const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (isToday(date)) return `Today · ${label}`;
  if (toDateKey(date) === toDateKey(addDays(new Date(), 1))) return `Tomorrow · ${label}`;
  return label;
}

// The reverse of toDateKey: a local YYYY-MM-DD back to midnight that day. Invalid keys give today.
export function fromDateKey(key: string | undefined): Date {
  const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return startOfToday();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

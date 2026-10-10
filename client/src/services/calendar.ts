import { ApiError, apiGet, SessionExpiredError } from '@/services/api';
import type { SavedOutfit } from '@/services/outfits';

// GET /api/calendar: one planned day, with the outfit planned for it.
export type CalendarEntry = {
  id: string; // the calendar entry's id
  date: string; // YYYY-MM-DD
  eventName: string | null;
  outfit: SavedOutfit;
};

// GET /api/calendar?from=&to= (both YYYY-MM-DD, inclusive), earliest first.
// Not on the server yet (see PLAN.md section 9).
export async function getCalendarEntries(from: string, to: string): Promise<CalendarEntry[]> {
  try {
    return await apiGet<CalendarEntry[]>(`/api/calendar?from=${from}&to=${to}`);
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e;
    if (__DEV__) console.warn('Calendar request failed:', e instanceof ApiError ? `${e.status} ${e.serverMessage}` : e);
    throw new Error('Could not load your calendar. Please try again.');
  }
}

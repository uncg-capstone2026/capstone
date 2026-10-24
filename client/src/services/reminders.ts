import * as Notifications from 'expo-notifications';
import { IosAuthorizationStatus } from 'expo-notifications';

import { SessionExpiredError } from '@/services/api';
import { getCalendarEntries, type CalendarEntry } from '@/services/calendar';
import { getNotificationsEnabled } from '@/services/preferences';
import { addDays, fromDateKey, startOfToday, toDateKey } from '@/utils/dates';

// Outfit reminders are local notifications: the app schedules them on the phone from the
// calendar, and iOS shows them at the time even when the app is closed. No server or push
// service is involved, so a plan made on another device is only covered once this phone
// opens the app (which resyncs).

const REMINDER_HOUR = 17; // 5 PM the day before
const DAYS_AHEAD = 60;
const MAX_SCHEDULED = 64; // iOS keeps at most 64 scheduled notifications per app

export type NotificationPermission = 'granted' | 'undetermined' | 'denied';

// Shows reminders as a banner even while the app is open. Called once from the root layout.
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

// Shows the system "Allow notifications?" prompt if the user hasn't answered it yet.
// True if notifications are allowed. Once denied, only the Settings app can change it.
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await getNotificationPermission();
    if (current !== 'undetermined') return current === 'granted';
    return toPermission(await Notifications.requestPermissionsAsync()) === 'granted';
  } catch {
    return false;
  }
}

function toPermission(settings: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (settings.granted || settings.ios?.status === IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  return settings.canAskAgain ? 'undetermined' : 'denied';
}

let pending: Promise<void> = Promise.resolve();

// Replaces the scheduled reminders with one for 5 PM the day before each planned day, from
// the calendar. Call it whenever plans may have changed: app open, sign-in, and after
// planning, unplanning, accepting or deleting an outfit. Runs one at a time, and never throws.
export function syncReminders(): Promise<void> {
  pending = pending.then(scheduleReminders).catch((e) => {
    if (__DEV__ && !(e instanceof SessionExpiredError)) console.warn('Could not schedule outfit reminders:', e);
  });
  return pending;
}

export async function cancelReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled, or notifications aren't available.
  }
}

async function scheduleReminders() {
  const [enabled, permission] = await Promise.all([getNotificationsEnabled(), getNotificationPermission()]);
  if (!enabled || permission !== 'granted') {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  // Today's reminder went out yesterday, so start from tomorrow.
  const today = startOfToday();
  const entries = await getCalendarEntries(toDateKey(addDays(today, 1)), toDateKey(addDays(today, DAYS_AHEAD)));

  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), entry]);

  const now = Date.now();
  const reminders = [...byDay]
    .map(([dateKey, dayEntries]) => {
      const at = addDays(fromDateKey(dateKey), -1);
      at.setHours(REMINDER_HOUR, 0, 0, 0);
      return { at, dayEntries };
    })
    .filter(({ at }) => at.getTime() > now) // e.g. planning tomorrow after 5 PM
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);

  // Cleared only after the calendar loaded, so a failed request keeps the old reminders.
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const { at, dayEntries } of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { ...reminderText(dayEntries), sound: true, data: { url: '/calendar' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
}

// One outfit: "Easy layers for class, for Lab day." Several: "You have 2 outfits planned:
// Lab day, Dinner with Maya."
function reminderText(entries: CalendarEntry[]): { title: string; body: string } {
  if (entries.length === 1) {
    const [{ outfit, eventName }] = entries;
    return {
      title: "Tomorrow's outfit",
      body: eventName ? `${outfit.name}, for ${eventName}.` : `${outfit.name} is planned for tomorrow.`,
    };
  }
  const labels = entries.map((entry) => entry.eventName ?? entry.outfit.name);
  return {
    title: "Tomorrow's outfits",
    body: `You have ${entries.length} outfits planned: ${labels.join(', ')}.`,
  };
}

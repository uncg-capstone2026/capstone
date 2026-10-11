import { useSyncExternalStore } from 'react';

import {
  DEFAULT_NOTIFICATIONS_ENABLED,
  getNotificationsEnabled,
  setNotificationsEnabled,
} from '@/services/preferences';

// One shared value for the whole app, like useTemperatureUnit. Until the saved value loads,
// it's the default.
let currentEnabled = DEFAULT_NOTIFICATIONS_ENABLED;
let hasLoaded = false;
let hasUserChosen = false;
const listeners = new Set<() => void>();

function update(enabled: boolean) {
  currentEnabled = enabled;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hasLoaded) {
    hasLoaded = true;
    getNotificationsEnabled().then((saved) => {
      // Don't overwrite a choice made while it was still loading.
      if (!hasUserChosen) update(saved);
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

// Updates the switch everywhere and saves it. Resolves once saved, so reminders can resync.
export async function saveNotificationsEnabled(enabled: boolean): Promise<void> {
  hasUserChosen = true;
  update(enabled);
  try {
    await setNotificationsEnabled(enabled);
  } catch {
    // Keeps working for this session; it just won't be remembered next launch.
  }
}

export function useNotificationsEnabled() {
  const enabled = useSyncExternalStore(
    subscribe,
    () => currentEnabled,
    () => DEFAULT_NOTIFICATIONS_ENABLED,
  );
  return { enabled, setEnabled: saveNotificationsEnabled };
}

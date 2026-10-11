import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncReminders } from '@/services/reminders';

// Used by the tabs layout, so it runs whenever a signed-in user is in the app. Reschedules
// outfit reminders on open and each time the app comes back to the foreground (plans may have
// changed on another device), and opens the Calendar when a reminder is tapped.
export function useOutfitReminders() {
  useEffect(() => {
    void syncReminders();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncReminders();
    });
    const taps = Notifications.addNotificationResponseReceivedListener(openReminder);

    // A tap that launched the app happened before this listener existed.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        openReminder(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});

    return () => {
      appState.remove();
      taps.remove();
    };
  }, []);
}

function openReminder(response: Notifications.NotificationResponse) {
  if (response.notification.request.content.data?.url === '/calendar') router.navigate('/calendar');
}

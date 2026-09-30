import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { SessionExpiredError } from '@/services/api';
import { getWeather, type Weather } from '@/services/weather';

// A reading from the last 10 minutes is close enough and skips waiting for a GPS fix.
// It matches how long the server caches weather.
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

// Weather for where the user is now. Asks for foreground location permission the first
// time. If it's denied, `permissionDenied` is true and `weather` stays null, so the screen
// can ask for a city instead or hide the weather section.
export function useWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Doesn't show the prompt again once the user has answered it.
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setPermissionDenied(!granted);
        if (!granted) return;

        const position = await getPosition();
        if (cancelled) return;
        if (!position) {
          setError('Could not find your location. Check that Location Services is on.');
          return;
        }

        const { latitude: lat, longitude: lon } = position.coords;
        const result = await getWeather({ lat, lon });
        if (!cancelled) setWeather(result);
      } catch (e) {
        if (cancelled || e instanceof SessionExpiredError) return;
        setError(e instanceof Error ? e.message : 'Could not load the weather.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  return {
    weather,
    loading,
    error,
    permissionDenied,
    refresh: () => setReloadCount((n) => n + 1),
  };
}

// Accuracy.Low (about 1 km) is plenty for weather and gets a fix faster.
// Null if there's no fix, e.g. Location Services is off for the whole device.
async function getPosition(): Promise<Location.LocationObject | null> {
  try {
    return (
      (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }))
    );
  } catch {
    return null;
  }
}

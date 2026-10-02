import { useSyncExternalStore } from 'react';

import {
  DEFAULT_TEMPERATURE_UNIT,
  getTemperatureUnit,
  setTemperatureUnit,
  type TemperatureUnit,
} from '@/services/preferences';

// One shared value for the whole app, so switching units in Settings updates any weather
// shown on another tab straight away. Until the saved value loads, it's the default.
let currentUnit: TemperatureUnit = DEFAULT_TEMPERATURE_UNIT;
let hasLoaded = false;
let hasUserChosen = false;
const listeners = new Set<() => void>();

function update(unit: TemperatureUnit) {
  currentUnit = unit;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hasLoaded) {
    hasLoaded = true;
    getTemperatureUnit().then((saved) => {
      // Don't overwrite a choice made while it was still loading.
      if (!hasUserChosen) update(saved);
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

function setUnit(unit: TemperatureUnit) {
  hasUserChosen = true;
  update(unit);
  setTemperatureUnit(unit).catch(() => {
    // Keeps working for this session; it just won't be remembered next launch.
  });
}

export function useTemperatureUnit() {
  const unit = useSyncExternalStore(
    subscribe,
    () => currentUnit,
    () => DEFAULT_TEMPERATURE_UNIT,
  );
  return { unit, setUnit };
}

import AsyncStorage from '@react-native-async-storage/async-storage';

// Device preferences: not secret, so plain AsyncStorage rather than SecureStore (which holds
// the session token). They survive sign-out, since they belong to the device, not the account.

export type TemperatureUnit = 'F' | 'C';

export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnit = 'F';

const TEMPERATURE_UNIT_KEY = 'styleme.temperature-unit';

export async function getTemperatureUnit(): Promise<TemperatureUnit> {
  try {
    const stored = await AsyncStorage.getItem(TEMPERATURE_UNIT_KEY);
    return stored === 'F' || stored === 'C' ? stored : DEFAULT_TEMPERATURE_UNIT;
  } catch {
    return DEFAULT_TEMPERATURE_UNIT;
  }
}

export async function setTemperatureUnit(unit: TemperatureUnit): Promise<void> {
  await AsyncStorage.setItem(TEMPERATURE_UNIT_KEY, unit);
}

// The Notifications switch in Settings. Only kept on this device for now; nothing sends
// notifications yet (see PLAN.md).
export const DEFAULT_NOTIFICATIONS_ENABLED = true;

const NOTIFICATIONS_ENABLED_KEY = 'styleme.notifications-enabled';

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return stored === null ? DEFAULT_NOTIFICATIONS_ENABLED : stored === 'true';
  } catch {
    return DEFAULT_NOTIFICATIONS_ENABLED;
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

// The outfit stage's background on the suggestion screen, and each saved outfit's until the
// user picks one.
export const DEFAULT_STAGE_COLOR = '#DEE6D3';

const STAGE_COLOR_KEY = 'styleme.stage-color';

export async function getStageColor(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STAGE_COLOR_KEY);
    return stored && /^#[0-9A-F]{6}$/i.test(stored) ? stored : DEFAULT_STAGE_COLOR;
  } catch {
    return DEFAULT_STAGE_COLOR;
  }
}

export async function setStageColor(color: string): Promise<void> {
  await AsyncStorage.setItem(STAGE_COLOR_KEY, color);
}

// The time zone last sent to the server, so it's only sent again when the device's changes.
const SENT_TIME_ZONE_KEY = 'styleme.sent-time-zone';

export async function getSentTimeZone(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SENT_TIME_ZONE_KEY);
  } catch {
    return null;
  }
}

export async function setSentTimeZone(timeZone: string): Promise<void> {
  await AsyncStorage.setItem(SENT_TIME_ZONE_KEY, timeZone);
}

// Each saved outfit's background, keyed by outfit id. Kept on this device only. Read from
// storage once, then kept in memory; screens showing outfits subscribe, so a colour changed on
// the outfit details screen shows everywhere straight away (see useOutfitColors).
const OUTFIT_COLORS_KEY = 'styleme.outfit-colors';

let outfitColors: Record<string, string> | null = null;
let loadingOutfitColors: Promise<Record<string, string>> | null = null;
const outfitColorListeners = new Set<() => void>();

export function getOutfitColors(): Promise<Record<string, string>> {
  if (outfitColors) return Promise.resolve(outfitColors);
  loadingOutfitColors ??= AsyncStorage.getItem(OUTFIT_COLORS_KEY)
    .then((stored) => (stored ? (JSON.parse(stored) as Record<string, string>) : {}))
    .catch(() => ({}))
    .then((loaded) => {
      // A colour set while loading wins over the stored one.
      outfitColors = { ...loaded, ...outfitColors };
      return outfitColors;
    });
  return loadingOutfitColors;
}

export async function setOutfitColor(outfitId: string, color: string): Promise<void> {
  const colors = await getOutfitColors();
  outfitColors = { ...colors, [outfitId]: color };
  outfitColorListeners.forEach((listener) => listener());
  await AsyncStorage.setItem(OUTFIT_COLORS_KEY, JSON.stringify(outfitColors));
}

// Calls listener whenever an outfit's colour changes. Returns the unsubscribe function.
export function subscribeToOutfitColors(listener: () => void): () => void {
  outfitColorListeners.add(listener);
  return () => {
    outfitColorListeners.delete(listener);
  };
}

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

// The outfit stage's background on the suggestion screen.
export const DEFAULT_STAGE_COLOR = '#EFEAE0';

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

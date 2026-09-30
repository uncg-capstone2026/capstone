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

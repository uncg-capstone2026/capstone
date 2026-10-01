import { isBackendConfigured } from '@/config/api';
import { ApiError, apiGet, SessionExpiredError } from '@/services/api';
import type { TemperatureUnit } from '@/services/preferences';
import { daysFromToday } from '@/utils/dates';

// Matches the server's GET /api/weather response. The server sends both units so the
// app can pick °F or °C without another request.
export type Weather = {
  tempC: number;
  feelsLikeC: number;
  highC: number;
  lowC: number;
  tempF: number;
  feelsLikeF: number;
  highF: number;
  lowF: number;
  condition: string; // e.g. "Partly cloudy"
  iconUrl: string; // https://cdn.weatherapi.com/...
  chanceOfRain: number; // 0-100
  uvIndex: number;
  windKph: number;
  locationName: string;
  // The day this forecast is for (YYYY-MM-DD). Not sent by the server yet; it will be once
  // GET /api/weather accepts ?date= (see PLAN.md).
  date?: string;
};

// The server forecasts 7 days including today (e.g. Oct 1-7). Past that, there's no weather.
export const FORECAST_DAYS = 7;

export function hasForecast(date: Date): boolean {
  const days = daysFromToday(date);
  return days >= 0 && days < FORECAST_DAYS;
}

export type WeatherLocation = { lat: number; lon: number } | { city: string };

// The app never calls WeatherAPI.com directly; the server holds the key and caches results.
// Until EXPO_PUBLIC_API_URL is set, there's no weather.
// `date` is a local YYYY-MM-DD; leave it out for today.
export async function getWeather(location: WeatherLocation, date?: string): Promise<Weather | null> {
  if (!isBackendConfigured) return null;

  const query =
    'city' in location
      ? `q=${encodeURIComponent(location.city.trim())}`
      : `lat=${location.lat}&lon=${location.lon}`;
  const dateQuery = date ? `&date=${date}` : '';

  try {
    return await apiGet<Weather>(`/api/weather?${query}${dateQuery}`);
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e;
    // 400 is an unknown city; 503 is WeatherAPI.com being down. Both messages are safe to show.
    if (e instanceof ApiError && (e.status === 400 || e.status === 503) && e.serverMessage) {
      throw new Error(e.serverMessage);
    }
    throw new Error('Could not load the weather. Please try again.');
  }
}

// The temperatures in the unit chosen in Settings, so screens don't pick fields by hand.
export function temperaturesIn(weather: Weather, unit: TemperatureUnit) {
  return unit === 'F'
    ? { temp: weather.tempF, feelsLike: weather.feelsLikeF, high: weather.highF, low: weather.lowF }
    : { temp: weather.tempC, feelsLike: weather.feelsLikeC, high: weather.highC, low: weather.lowC };
}

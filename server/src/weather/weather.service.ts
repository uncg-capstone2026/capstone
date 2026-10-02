import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Our WeatherAPI.com plan returns 7 forecast days, including today (so today + 6).
const FORECAST_DAYS = 7;

export type Weather = {
  date: string; // YYYY-MM-DD, in the location's local time
  tempC: number; feelsLikeC: number; highC: number; lowC: number;
  tempF: number; feelsLikeF: number; highF: number; lowF: number;
  condition: string; iconUrl: string; chanceOfRain: number;
  uvIndex: number; windKph: number; locationName: string;
};

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  // One cached forecast per location, covering every day we can answer for.
  private cache = new Map<string, { forecast: any; expires: number }>();
  private readonly TTL = 10 * 60 * 1000;

  constructor(private config: ConfigService) {}

  async getWeather(query: { lat?: number; lon?: number; q?: string; date?: string }): Promise<Weather> {
    const location = query.q?.trim()
      || `${Number(query.lat).toFixed(2)},${Number(query.lon).toFixed(2)}`; // ~1 km rounding
    const forecast = await this.getForecast(location);

    const days: any[] = forecast.forecast.forecastday;
    const today = days[0];
    // Match by date: WeatherAPI's dates are in the location's local time,
    // which avoids off-by-one errors from the server running on UTC.
    const target = query.date ? days.find((d) => d.date === query.date) : today;
    if (!target) {
      throw new BadRequestException({
        message: `Forecast is only available from ${today.date} to ${days[days.length - 1].date}`,
      });
    }

    const locationName = forecast.location.name;
    return target === today
      ? this.todayWeather(forecast.current, target, locationName)
      : this.futureWeather(target, locationName);
  }

  // Today: "right now" values from current, plus the day's high/low and rain chance.
  private todayWeather(current: any, today: any, locationName: string): Weather {
    return {
      date: today.date,
      tempC: current.temp_c,             tempF: current.temp_f,
      feelsLikeC: current.feelslike_c,   feelsLikeF: current.feelslike_f,
      highC: today.day.maxtemp_c,        highF: today.day.maxtemp_f,
      lowC: today.day.mintemp_c,         lowF: today.day.mintemp_f,
      condition: current.condition.text,
      iconUrl: `https:${current.condition.icon}`, // API returns //cdn.weatherapi.com/...
      chanceOfRain: today.day.daily_chance_of_rain,
      uvIndex: current.uv,
      windKph: current.wind_kph,
      locationName,
    };
  }

  // A future day: there's no "current" reading, so temp/feelsLike use the day's average.
  private futureWeather(target: any, locationName: string): Weather {
    const day = target.day;
    return {
      date: target.date,
      tempC: day.avgtemp_c,              tempF: day.avgtemp_f,
      feelsLikeC: day.avgtemp_c,         feelsLikeF: day.avgtemp_f,
      highC: day.maxtemp_c,              highF: day.maxtemp_f,
      lowC: day.mintemp_c,               lowF: day.mintemp_f,
      condition: day.condition.text,
      iconUrl: `https:${day.condition.icon}`,
      chanceOfRain: day.daily_chance_of_rain,
      uvIndex: day.uv,
      windKph: day.maxwind_kph,
      locationName,
    };
  }

  // Fetches the full forecast for a location, or returns it from the cache.
  private async getForecast(location: string): Promise<any> {
    const cacheKey = location.toLowerCase();
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.forecast;

    const key = this.config.getOrThrow<string>('WEATHERAPI_KEY');
    const url =
      `https://api.weatherapi.com/v1/forecast.json?key=${key}` +
      `&q=${encodeURIComponent(location)}&days=${FORECAST_DAYS}&aqi=no&alerts=no`;

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      this.logger.warn(`WeatherAPI unreachable for ${location}`); // never log the URL (contains key)
      throw new ServiceUnavailableException({ message: 'Weather is unavailable right now' });
    }
    if (res.status === 400) throw new BadRequestException({ message: 'Location not found' });
    if (!res.ok) {
      this.logger.warn(`WeatherAPI returned ${res.status} for ${location}`);
      throw new ServiceUnavailableException({ message: 'Weather is unavailable right now' });
    }

    const forecast = await res.json();
    // Drop the hour-by-hour data we never use, so cached entries stay small.
    for (const d of forecast.forecast.forecastday) delete d.hour;

    this.pruneExpired();
    this.cache.set(cacheKey, { forecast, expires: Date.now() + this.TTL });
    return forecast;
  }

  // Removes expired entries so the cache can't grow forever.
  private pruneExpired() {
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (v.expires <= now) this.cache.delete(k);
    }
  }
}
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type Weather = {
  tempC: number; feelsLikeC: number; highC: number; lowC: number;
  tempF: number; feelsLikeF: number; highF: number; lowF: number;
  condition: string; iconUrl: string; chanceOfRain: number;
  uvIndex: number; windKph: number; locationName: string;
};

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private cache = new Map<string, { data: Weather; expires: number }>();
  private readonly TTL = 10 * 60 * 1000;

  constructor(private config: ConfigService) {}

  async getWeather(query: { lat?: number; lon?: number; q?: string }): Promise<Weather> {
    const location = query.q?.trim()
      || `${Number(query.lat).toFixed(2)},${Number(query.lon).toFixed(2)}`; // ~1 km rounding
    const cacheKey = location.toLowerCase();

    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.data;

    const key = this.config.getOrThrow<string>('WEATHERAPI_KEY');
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${encodeURIComponent(location)}&days=1`;

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

    const raw = await res.json();
    const day = raw.forecast.forecastday[0].day;
    const data: Weather = {
      tempC: raw.current.temp_c,       tempF: raw.current.temp_f,
      feelsLikeC: raw.current.feelslike_c, feelsLikeF: raw.current.feelslike_f,
      highC: day.maxtemp_c,            highF: day.maxtemp_f,
      lowC: day.mintemp_c,             lowF: day.mintemp_f,
      condition: raw.current.condition.text,
      iconUrl: `https:${raw.current.condition.icon}`, // API returns //cdn.weatherapi.com/...
      chanceOfRain: day.daily_chance_of_rain,
      uvIndex: raw.current.uv,
      windKph: raw.current.wind_kph,
      locationName: raw.location.name,
    };

    this.cache.set(cacheKey, { data, expires: Date.now() + this.TTL });
    return data;
  }
}
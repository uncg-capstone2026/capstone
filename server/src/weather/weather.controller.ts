import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WeatherQueryDto } from './weather.dto';
import { WeatherService } from './weather.service';

@Controller('weather') // becomes /api/weather via the global prefix
@UseGuards(AuthGuard)
export class WeatherController {
  constructor(private weather: WeatherService) {}

  @Get()
  get(@Query() query: WeatherQueryDto) {
    return this.weather.getWeather(query);
  }
}
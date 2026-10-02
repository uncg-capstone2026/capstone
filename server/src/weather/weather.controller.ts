import { Controller, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WeatherQueryDto } from './weather.dto';
import { WeatherService } from './weather.service';

@Controller('weather') // becomes /api/weather via the global prefix
@UseGuards(AuthGuard)
export class WeatherController {
  constructor(private weather: WeatherService) {}

  // GET /api/weather?lat=..&lon=..[&date=YYYY-MM-DD]  or  ?q=<city>[&date=...]
  @Get()
  get(@Query(new ValidationPipe({ transform: true })) query: WeatherQueryDto) {
    return this.weather.getWeather(query);
  }
}
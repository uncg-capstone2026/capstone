import { Module } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';

@Module({
  providers: [WeatherService],
  controllers: [WeatherController],
  exports: [WeatherService], // the Stylist uses the day's forecast to pick clothes
})
export class WeatherModule {}

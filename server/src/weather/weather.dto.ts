import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class WeatherQueryDto {
  @ValidateIf((o: WeatherQueryDto) => !o.q) @Type(() => Number) @IsLatitude()
  lat?: number;

  @ValidateIf((o: WeatherQueryDto) => !o.q) @Type(() => Number) @IsLongitude()
  lon?: number;

  @IsOptional() @IsString() @Length(2, 100)
  q?: string;

  // Optional day to get the forecast for. Omit it for today.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;
}
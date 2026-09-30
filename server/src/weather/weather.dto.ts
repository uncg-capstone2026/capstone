import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class WeatherQueryDto {
  @ValidateIf((o) => !o.q) @Type(() => Number) @IsLatitude()
  lat?: number;

  @ValidateIf((o) => !o.q) @Type(() => Number) @IsLongitude()
  lon?: number;

  @IsOptional() @IsString() @Length(2, 100)
  q?: string;
}
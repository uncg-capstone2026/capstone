import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, MaxLength,
} from 'class-validator';

export class StyleOutfitDto {
  // Where they're headed or what they're going for.
  @IsString()
  @Length(1, 300)
  occasion!: string;

  // Optional day the outfit is for. Helps the stylist pick for the season.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  // Where the user is, so the stylist can use that day's weather. Optional:
  // without it (or if the forecast fails) outfits are picked without weather.
  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsLongitude()
  lon?: number;

  // suggestionIds the user has already seen, for "Try another suggestion".
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  excludeSuggestionIds?: string[];
}
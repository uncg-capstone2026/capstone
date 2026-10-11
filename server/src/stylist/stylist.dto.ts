import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length, Matches, MaxLength,
} from 'class-validator';
import { MAX_TRY_ON_ITEMS } from '../gemini/constants';

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

export class RepromptDto {
  // From the first response (or the last reprompt).
  @IsUUID()
  sessionId!: string;

  // The user's feedback, e.g. "different shoes". Empty or left out for
  // "Try another".
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}

export class TryOnDto {
  // The pieces of the outfit on screen, including any the user swapped in.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TRY_ON_ITEMS)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemIds!: string[];
}

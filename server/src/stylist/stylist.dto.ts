import {
  ArrayMaxSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';

// POST /api/stylist/outfit
export class StyleOutfitDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  // Where they're headed or what they're going for.
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  occasion!: string;

  // suggestionIds already shown, for "Try another suggestion".
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  excludeSuggestionIds?: string[];

  // The user's location, for that day's weather. Optional: without it the
  // stylist still works, just without weather.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;
}
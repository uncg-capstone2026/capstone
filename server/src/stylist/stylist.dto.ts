import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class StyleOutfitDto {
  // Where they're headed or what they're going for.
  @IsString()
  @Length(1, 300)
  occasion!: string;

  // Optional day the outfit is for. Helps the stylist pick for the season.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;
}

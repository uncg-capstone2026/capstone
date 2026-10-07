import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsString, MaxLength,
} from 'class-validator';

// POST /api/outfits { name, itemIds }
export class CreateOutfitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string; // trimmed by the service; 1-60 characters

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemIds!: string[];
}

// PATCH /api/outfits/:id { isFavorite }
export class UpdateOutfitDto {
  @IsBoolean()
  isFavorite!: boolean;
}
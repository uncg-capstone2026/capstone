import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, Matches,
  MaxLength, ValidateIf,
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

// PATCH /api/outfits/:id { isFavorite?, itemIds? }. At least one is required
// (checked by the service). Neither can be null.
export class UpdateOutfitDto {
  @ValidateIf((o) => o.isFavorite !== undefined)
  @IsBoolean()
  isFavorite?: boolean;

  @ValidateIf((o) => o.itemIds !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemIds?: string[];
}

// POST /api/outfits/:id/schedule { date, eventName? }
export class ScheduleOutfitDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventName?: string | null;
}
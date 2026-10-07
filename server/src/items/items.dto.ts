import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString,
  Length, Matches, MaxLength, ValidateIf,
} from 'class-validator';
import { CLIENT_CATEGORIES, CLIENT_FITS } from './item-mappings';

export class PhotoUploadUrlDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'], {
    message: 'Only JPEG, PNG or WebP images are allowed',
  })
  contentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;
}

export class SavePhotoDto {
  @IsString()
  @Matches(/^users\/[^/]+\/clothing\/[0-9a-f-]+\.(jpg|png|webp)$/, {
    message: 'Invalid photo key',
  })
  key!: string;
}

// PATCH /api/items/:id — every field is optional; only the ones sent get changed.
export class UpdateItemDto {
  // These can't be null in the database, so null is rejected (only "missing" is allowed).
  @ValidateIf((_, v) => v !== undefined) @IsBoolean()
  isFavorite?: boolean;

  @ValidateIf((_, v) => v !== undefined) @IsString() @Length(1, 60)
  name?: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsArray() @ArrayMaxSize(3)
  @Matches(/^#[0-9a-fA-F]{6}$/, { each: true, message: 'colorHex values must look like #1A2B3C' })
  colorHex?: string[];

  // When true, the Stylist never uses this item in outfit suggestions.
  @ValidateIf((_, v) => v !== undefined) @IsBoolean()
  excludeFromSuggestions?: boolean;

  // These can be cleared by sending null.
  @IsOptional() @IsIn(CLIENT_CATEGORIES)
  category?: string | null;

  @IsOptional() @IsIn(CLIENT_FITS)
  fit?: string | null;

  @IsOptional() @IsString() @MaxLength(50) type?: string | null;
  @IsOptional() @IsString() @MaxLength(50) cut?: string | null;
  @IsOptional() @IsString() @MaxLength(50) pattern?: string | null;
  @IsOptional() @IsString() @MaxLength(50) material?: string | null;
  @IsOptional() @IsString() @MaxLength(50) season?: string | null;
  @IsOptional() @IsString() @MaxLength(50) formality?: string | null;
}
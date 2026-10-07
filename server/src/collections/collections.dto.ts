import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

// POST /api/collections { name } and PATCH /api/collections/:id { name }.
// The service trims it and checks 1-40 characters, so the app gets one clear message.
export class CollectionNameDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}

// POST /api/collections/:id/outfits { outfitIds }
export class AddOutfitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  outfitIds!: string[];
}
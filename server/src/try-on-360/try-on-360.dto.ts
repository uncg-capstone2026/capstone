import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';
import { MAX_TRY_ON_ITEMS } from '../gemini/constants';

export class TryOn360Dto {
  // A form field, so comma-separated: "id1,id2,id3". Repeating the field
  // (itemIds=id1&itemIds=id2) works too.
  @Transform(({ value }) => (typeof value === 'string'
    ? [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))]
    : value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TRY_ON_ITEMS)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemIds!: string[];
}

import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, Matches, MaxLength,
} from 'class-validator';

// POST /api/stylist/outfit/accept. Matches AcceptOutfitRequest in client/src/services/stylist.ts.
export class AcceptOutfitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  suggestionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string; // the outfit's name (trimmed by OutfitsService)

  @IsString()
  @MaxLength(100)
  eventName!: string; // what the user called the occasion; may be empty

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date!: string; // the day the outfit is planned for
}

// POST /api/stylist/outfit/feedback. Matches RejectOutfitRequest in client/src/services/stylist.ts.
export class OutfitFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  suggestionId!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  itemIds!: string[];

  @IsString()
  @MaxLength(500)
  feedback!: string; // "What would you rather wear?"; may be empty
}
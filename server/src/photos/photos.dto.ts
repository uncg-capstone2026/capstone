import { IsString, Matches } from 'class-validator';

// The upload-url request is identical to the item one, so it's reused from items.dto.ts.
export { PhotoUploadUrlDto } from '../items/items.dto';

export class SaveBodyPhotoDto {
  @IsString()
  @Matches(/^users\/[^/]+\/body\/[0-9a-f-]+\.(jpg|png|webp)$/, {
    message: 'Invalid photo key',
  })
  key!: string;
}
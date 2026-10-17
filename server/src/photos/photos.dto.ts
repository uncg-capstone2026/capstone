import { IsString, Matches } from 'class-validator';

// The upload-url request is identical to the item one, so it's reused from items.dto.ts.
export { PhotoUploadUrlDto } from '../items/items.dto';

// A body photo's S3 key, as returned by POST /api/photos/body/upload-url.
const BODY_PHOTO_KEY = /^users\/[^/]+\/body\/[0-9a-f-]+\.(jpg|png|webp)$/;

// POST /api/photos/body: the front and back photos, uploaded separately.
// The two keys being the same is checked in PhotosService (400).
export class SaveBodyPhotosDto {
  @IsString()
  @Matches(BODY_PHOTO_KEY, { message: 'Invalid front photo key' })
  frontKey!: string;

  @IsString()
  @Matches(BODY_PHOTO_KEY, { message: 'Invalid back photo key' })
  backKey!: string;
}
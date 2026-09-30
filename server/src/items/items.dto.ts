import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
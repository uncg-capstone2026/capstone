import { Body, Controller, Post } from '@nestjs/common';
import { S3Service } from './s3.service';

@Controller('uploads')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  @Post('clothing')
  async getClothingUploadUrl(
    @Body() body: { userId: string; contentType: string },
  ) {
    const key = this.s3Service.buildKey(body.userId, 'clothing', 'jpg');
    const url = await this.s3Service.getUploadUrl(key, body.contentType);
    return { key, url };
  }

  @Post('body-photo')
  async getBodyPhotoUploadUrl(
    @Body() body: { userId: string; contentType: string },
  ) {
    const key = this.s3Service.buildKey(body.userId, 'body', 'jpg');
    const url = await this.s3Service.getUploadUrl(key, body.contentType);
    return { key, url };
  }
}
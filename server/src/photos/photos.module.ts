import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { S3Module } from '../s3/s3.module';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

// GeminiModule gives us Javier's TryOnService, which makes the other angles
// after a front and back upload.
@Module({
  imports: [S3Module, GeminiModule],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
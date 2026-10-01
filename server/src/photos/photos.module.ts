import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  imports: [S3Module], // copy whatever items.module.ts imports (e.g. also PrismaModule)
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}

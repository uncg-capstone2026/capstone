import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { GeminiController } from './gemini.controller';
import { GeminiHelpers } from './helpers';
import { ImageProcessingService } from './image-processing/service';
import { QueryExpansionService } from './query-expansion/service';
import { OutfitPlanningService } from './outfit-planning/service';

@Module({
  imports: [S3Module],
  controllers: [GeminiController],
  providers: [
    GeminiHelpers,
    ImageProcessingService,
    QueryExpansionService,
    OutfitPlanningService,
  ],
  exports: [ImageProcessingService, QueryExpansionService, OutfitPlanningService],
})
export class GeminiModule {}

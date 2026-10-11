import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { GeminiHelpers } from './helpers';
import { ImageProcessingService } from './image-processing/service';
import { QueryExpansionService } from './query-expansion/service';
import { OutfitPlanningService } from './outfit-planning/service';
import { HistorySummaryService } from './history-summary/service';
import { RepromptRouterService } from './reprompt-router/service';
import { TryOnService } from './try-on/service';

@Module({
  imports: [S3Module],
  providers: [
    GeminiHelpers,
    ImageProcessingService,
    QueryExpansionService,
    OutfitPlanningService,
    RepromptRouterService,
    HistorySummaryService,
    TryOnService,
  ],
  exports: [
    ImageProcessingService,
    QueryExpansionService,
    OutfitPlanningService,
    RepromptRouterService,
    HistorySummaryService,
    TryOnService,
  ],
})
export class GeminiModule {}

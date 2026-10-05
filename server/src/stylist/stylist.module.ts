import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { GeminiHelpers } from '../gemini/helpers';
import { S3Module } from '../s3/s3.module';
import { StylistController } from './stylist.controller';
import { StylistService } from './stylist.service';

// The Stylist tab: POST /api/stylist/outfit.
// - GeminiModule gives us Javier's QueryExpansionService and OutfitPlanningService.
// - GeminiHelpers (the Gemini client) isn't exported from GeminiModule, so it's
//   provided here too; it has no dependencies, so this doesn't touch his module.
@Module({
  imports: [GeminiModule, S3Module],
  controllers: [StylistController],
  providers: [StylistService, GeminiHelpers],
})
export class StylistModule {}
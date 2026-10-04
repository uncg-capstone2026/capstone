import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { GeminiHelpers } from '../gemini/helpers';
import { S3Module } from '../s3/s3.module';
import { WeatherModule } from '../weather/weather.module';
import { OutfitSelectionService } from './outfit-selection/service';
import { StylistController } from './stylist.controller';
import { StylistService } from './stylist.service';

// The Stylist tab: POST /api/stylist/outfit.
// - GeminiModule gives us Javier's QueryExpansionService and OutfitPlanningService.
// - GeminiHelpers isn't exported from GeminiModule, so it's listed as a provider
//   here (it has no dependencies), which avoids editing Javier's module.
// - PrismaService comes from the global PrismaModule.
@Module({
  imports: [GeminiModule, S3Module, WeatherModule],
  controllers: [StylistController],
  providers: [StylistService, OutfitSelectionService, GeminiHelpers],
})
export class StylistModule {}
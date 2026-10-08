import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { GeminiHelpers } from '../gemini/helpers';
import { OutfitsModule } from '../outfits/outfits.module';
import { S3Module } from '../s3/s3.module';
import { WeatherModule } from '../weather/weather.module';
import { OutfitFeedbackService } from './outfit-feedback.service';
import { StylistController } from './stylist.controller';
import { StylistService } from './stylist.service';

// The Stylist tab: /api/stylist/outfit, plus accept and feedback.
// - GeminiModule gives us Javier's QueryExpansionService and OutfitPlanningService.
// - GeminiHelpers (the Gemini client) isn't exported from GeminiModule, so it's
//   provided here too; it has no dependencies, so this doesn't touch his module.
// - WeatherModule gives us the day's forecast for the prompts.
// - OutfitsModule gives us OutfitsService.create for the accept route.
@Module({
  imports: [GeminiModule, S3Module, WeatherModule, OutfitsModule],
  controllers: [StylistController],
  providers: [StylistService, OutfitFeedbackService, GeminiHelpers],
})
export class StylistModule {}
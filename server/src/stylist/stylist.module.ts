import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { OutfitsModule } from '../outfits/outfits.module';
import { S3Module } from '../s3/s3.module';
import { StyleNotesModule } from '../style-notes/style-notes.module';
import { WeatherModule } from '../weather/weather.module';
import { OutfitFeedbackService } from './outfit-feedback.service';
import { StylistController } from './stylist.controller';
import { StylistSessionsService } from './stylist-sessions.service';
import { StylistService } from './stylist.service';

// The Stylist tab: /api/stylist/outfit and /outfit/reprompt, plus accept,
// feedback and try-on.
// - GeminiModule gives us the query expansion, outfit planning, reprompt
//   router, history summary and try-on services.
// - WeatherModule gives us the day's forecast for the prompts.
// - OutfitsModule gives us OutfitsService.create for the accept route.
// - StyleNotesModule gives us the user's style notes for the prompts.
@Module({
  imports: [GeminiModule, S3Module, WeatherModule, OutfitsModule, StyleNotesModule],
  controllers: [StylistController],
  providers: [StylistService, OutfitFeedbackService, StylistSessionsService],
})
export class StylistModule {}

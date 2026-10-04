import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { StylistController } from './stylist.controller';

@Module({
  imports: [GeminiModule],
  controllers: [StylistController],
})
export class StylistModule {}

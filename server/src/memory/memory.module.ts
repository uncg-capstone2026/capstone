import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { StyleNotesModule } from '../style-notes/style-notes.module';
import { MemoryService } from './memory.service';

// The hourly memory job. No routes. ScheduleModule.forRoot() is in AppModule;
// PrismaService comes from the global PrismaModule.
// - GeminiModule gives us StyleMemoryService.
// - StyleNotesModule gives us StyleNotesService, to save what's learned.
@Module({
  imports: [GeminiModule, StyleNotesModule],
  providers: [MemoryService],
})
export class MemoryModule {}

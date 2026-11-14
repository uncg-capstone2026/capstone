import { Module } from '@nestjs/common';
import { GeminiHelpers } from '../gemini/helpers';
import { StyleNotesController } from './style-notes.controller';
import { StyleNotesService } from './style-notes.service';

// Style Preferences: /api/style-notes. StyleNotesService is exported so the
// outfit prompts can read the notes (listForPrompt) and the memory job can
// save what it learns (createLearned, embedMissing).
// - GeminiHelpers (the Gemini client, no dependencies) is provided here for
//   embedding notes, so this module doesn't need to import GeminiModule.
// - PrismaService comes from the global PrismaModule.
@Module({
  controllers: [StyleNotesController],
  providers: [StyleNotesService, GeminiHelpers],
  exports: [StyleNotesService],
})
export class StyleNotesModule {}
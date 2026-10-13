import { Module } from '@nestjs/common';
import { GeminiHelpers } from '../gemini/helpers';
import { StyleNotesController } from './style-notes.controller';
import { StyleNotesService } from './style-notes.service';

// Style Preferences: /api/style-notes. StyleNotesService is exported so the
// outfit prompt can read the notes (listForPrompt, findRelevant).
// - GeminiHelpers (the Gemini client, no dependencies) is provided here for
//   embedding notes, instead of importing GeminiModule: GeminiModule will
//   import this module, and importing each other would be circular.
// - PrismaService comes from the global PrismaModule.
@Module({
  controllers: [StyleNotesController],
  providers: [StyleNotesService, GeminiHelpers],
  exports: [StyleNotesService],
})
export class StyleNotesModule {}
import { Module } from '@nestjs/common';
import { StyleNotesController } from './style-notes.controller';
import { StyleNotesService } from './style-notes.service';

// Style Preferences: /api/style-notes. StyleNotesService is exported so the
// outfit prompt can read the notes (listForPrompt). PrismaService comes from
// the global PrismaModule.
@Module({
  controllers: [StyleNotesController],
  providers: [StyleNotesService],
  exports: [StyleNotesService],
})
export class StyleNotesModule {}
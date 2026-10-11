import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { NoteSource, StyleNote as StyleNoteRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// One note, as the app shows it. Matches StyleNote in client/src/services/style-notes.ts.
export type StyleNote = {
  id: string;
  text: string;
  source: 'user' | 'learned';
  createdAt: Date; // sent as an ISO timestamp
};

export const MAX_NOTE_LENGTH = 200; // MAX_NOTE_LENGTH in the app
export const MAX_NOTES = 50;

const SOURCE_TO_CLIENT: Record<NoteSource, StyleNote['source']> = { User: 'user', Learned: 'learned' };

@Injectable()
export class StyleNotesService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/style-notes: newest first.
  async list(userId: string): Promise<StyleNote[]> {
    const notes = await this.prisma.styleNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map(toClient);
  }

  // POST /api/style-notes { text } -> the new note. 400 if the text is empty or
  // over 200 characters, or the user already has 50 notes.
  async create(userId: string, rawText: string): Promise<StyleNote> {
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) throw new BadRequestException('Write a note first');
    if (text.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(`Notes can be at most ${MAX_NOTE_LENGTH} characters`);
    }

    const count = await this.prisma.styleNote.count({ where: { userId } });
    if (count >= MAX_NOTES) {
      throw new BadRequestException(`You can have up to ${MAX_NOTES} notes. Delete one to add another.`);
    }

    const note = await this.prisma.styleNote.create({ data: { userId, text, source: 'User' } });
    return toClient(note);
  }

  // DELETE /api/style-notes/:id. 404 if it isn't the user's note.
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.styleNote.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Note not found');
  }

  // For Javier's prompt builders: the user's notes to add to an outfit request,
  // newest first, as plain text with where each came from. Import
  // StyleNotesModule into the module that builds the prompt, then inject
  // StyleNotesService and call this.
  async listForPrompt(userId: string): Promise<{ text: string; source: StyleNote['source'] }[]> {
    const notes = await this.prisma.styleNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_NOTES,
      select: { text: true, source: true },
    });
    return notes.map((note) => ({ text: note.text, source: SOURCE_TO_CLIENT[note.source] }));
  }
}

function toClient(note: StyleNoteRow): StyleNote {
  return { id: note.id, text: note.text, source: SOURCE_TO_CLIENT[note.source], createdAt: note.createdAt };
}
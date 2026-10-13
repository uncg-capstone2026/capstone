import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { NoteSource, StyleNote as StyleNoteRow } from '@prisma/client';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../gemini/constants';
import { GeminiHelpers } from '../gemini/helpers';
import { PrismaService } from '../prisma/prisma.service';

// One note, as the app shows it. Matches StyleNote in client/src/services/style-notes.ts.
export type StyleNote = {
  id: string;
  text: string;
  source: 'user' | 'learned';
  createdAt: Date; // sent as an ISO timestamp
};

// A note as the prompts use it.
export type PromptNote = { text: string; source: StyleNote['source']; createdAt: Date };

export const MAX_NOTE_LENGTH = 200; // MAX_NOTE_LENGTH in the app
export const MAX_NOTES = 50;

const SOURCE_TO_CLIENT: Record<NoteSource, StyleNote['source']> = { User: 'user', Learned: 'learned' };

@Injectable()
export class StyleNotesService {
  private readonly logger = new Logger(StyleNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiHelpers,
  ) {}

  // GET /api/style-notes: newest first.
  async list(userId: string): Promise<StyleNote[]> {
    const notes = await this.prisma.styleNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map(toClient);
  }

  // POST /api/style-notes { text } -> the new note. 400 if the text is empty or
  // over 200 characters, or the user already has 50 notes. The note is then
  // embedded; if that fails it's still saved, just without an embedding.
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
    await this.addEmbedding(note.id, text);
    return toClient(note);
  }

  // DELETE /api/style-notes/:id. 404 if it isn't the user's note.
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.styleNote.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Note not found');
  }

  // ---- For Javier's prompt builders ----
  // Import StyleNotesModule into the module that builds the prompt, then inject
  // StyleNotesService. (StyleNotesModule doesn't import GeminiModule, so this
  // can't create a circular import.)

  // All the user's notes, newest first, with where each came from and when.
  async listForPrompt(userId: string): Promise<PromptNote[]> {
    const notes = await this.prisma.styleNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_NOTES,
      select: { text: true, source: true, createdAt: true },
    });
    return notes.map((note) => ({ ...note, source: SOURCE_TO_CLIENT[note.source] }));
  }

  // The user's notes closest in meaning to an embedding (e.g. the request's,
  // from the same embedding model), closest first. Notes without an embedding
  // are skipped.
  async findRelevant(userId: string, embedding: number[], limit = 10): Promise<PromptNote[]> {
    const vector = `[${embedding.join(',')}]`;
    const rows = await this.prisma.$queryRaw<{ text: string; source: NoteSource; createdAt: Date }[]>`
      SELECT text, source, "createdAt"
      FROM "StyleNote"
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ ...row, source: SOURCE_TO_CLIENT[row.source] }));
  }

  // ---- Helpers ----

  // Embeds the note's text with the same model and size as items and requests,
  // so they can be compared. Prisma can't write the vector type, so it goes in
  // as '[0.1,...]' text and is cast in SQL. Failures are logged, never thrown.
  private async addEmbedding(noteId: string, text: string): Promise<void> {
    try {
      const response = await this.gemini.ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const values = response.embeddings?.[0]?.values;
      if (!values || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${values?.length ?? 'none'}`);
      }
      const vector = `[${values.join(',')}]`;
      await this.prisma.$executeRaw`UPDATE "StyleNote" SET embedding = ${vector}::vector WHERE id = ${noteId}`;
    } catch (err) {
      this.logger.warn(`Embedding failed for style note ${noteId}: ${(err as Error).message}`);
    }
  }
}

function toClient(note: StyleNoteRow): StyleNote {
  return { id: note.id, text: note.text, source: SOURCE_TO_CLIENT[note.source], createdAt: note.createdAt };
}
import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards, ValidationPipe,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { CreateStyleNoteDto } from './style-notes.dto';
import { StyleNotesService } from './style-notes.service';

@Controller('style-notes')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class StyleNotesController {
  constructor(private readonly notes: StyleNotesService) {}

  // GET /api/style-notes -> [{ id, text, source: 'user' | 'learned', createdAt }], newest first
  @Get()
  list(@CurrentUserId() userId: User['id']) {
    return this.notes.list(userId);
  }

  // POST /api/style-notes { text } -> 201, the new note
  // 400 if the text is empty or over 200 characters, or the user has 50 notes.
  @Post()
  create(
    @CurrentUserId() userId: User['id'],
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) body: CreateStyleNoteDto,
  ) {
    return this.notes.create(userId, body.text);
  }

  // DELETE /api/style-notes/:id -> 204. 404 if it isn't the user's note.
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: User['id'], @Param('id') id: string) {
    return this.notes.remove(userId, id);
  }
}
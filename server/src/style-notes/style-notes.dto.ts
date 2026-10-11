import { IsString, MaxLength } from 'class-validator';

// POST /api/style-notes { text }. The service trims it and checks 1-200
// characters, so the app gets one clear message.
export class CreateStyleNoteDto {
  @IsString()
  @MaxLength(2000) // a sanity cap; the real limit is checked after trimming
  text!: string;
}
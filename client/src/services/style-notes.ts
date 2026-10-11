import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, apiDelete, apiGet, apiPost, SessionExpiredError } from '@/services/api';

// The style notes routes aren't on the server yet (PLAN.md section 7), so this keeps notes on
// the device. Set it to false once they're live. Until then, notes don't reach the AI.
const USE_STYLE_NOTES_FIXTURE = true;

export const MAX_NOTE_LENGTH = 200;

// What StyleMe remembers about the user's style, added to every outfit request. `learned`
// notes come from the outfits they accept and reject.
export type StyleNote = {
  id: string;
  text: string;
  source: 'user' | 'learned';
  createdAt: string; // ISO timestamp
};

// GET /api/style-notes -> the user's notes, newest first.
export async function listStyleNotes(): Promise<StyleNote[]> {
  if (USE_STYLE_NOTES_FIXTURE) return readFixtureNotes();
  try {
    return await apiGet<StyleNote[]>('/api/style-notes');
  } catch (e) {
    throw styleNotesError(e, "Couldn't load your style notes. Please try again.");
  }
}

// POST /api/style-notes { text } -> the new note. 400 for an empty or too-long note.
export async function addStyleNote(text: string): Promise<StyleNote> {
  if (USE_STYLE_NOTES_FIXTURE) {
    const note: StyleNote = {
      id: `fixture-note-${Date.now()}`,
      text: text.trim(),
      source: 'user',
      createdAt: new Date().toISOString(),
    };
    await writeFixtureNotes([note, ...(await readFixtureNotes())]);
    return note;
  }
  try {
    return await apiPost<StyleNote>('/api/style-notes', { text: text.trim() });
  } catch (e) {
    throw styleNotesError(e, "Couldn't add your note. Please try again.");
  }
}

// DELETE /api/style-notes/:id
export async function deleteStyleNote(id: string): Promise<void> {
  if (USE_STYLE_NOTES_FIXTURE) {
    await writeFixtureNotes((await readFixtureNotes()).filter((note) => note.id !== id));
    return;
  }
  try {
    await apiDelete(`/api/style-notes/${id}`);
  } catch (e) {
    throw styleNotesError(e, "Couldn't delete your note. Please try again.");
  }
}

function styleNotesError(e: unknown, fallback: string): Error {
  if (e instanceof SessionExpiredError) return e;
  if (__DEV__) console.warn('Style notes request failed:', e instanceof ApiError ? `${e.status} ${e.serverMessage}` : e);
  // 400 is an empty or too-long note, or too many notes. The message is for the user.
  if (e instanceof ApiError && e.status === 400 && e.serverMessage) return new Error(e.serverMessage);
  return new Error(fallback);
}

// ---- Fixture ----

const FIXTURE_KEY = 'styleme.style-notes';

async function readFixtureNotes(): Promise<StyleNote[]> {
  try {
    const stored = await AsyncStorage.getItem(FIXTURE_KEY);
    return stored ? (JSON.parse(stored) as StyleNote[]) : [];
  } catch {
    return [];
  }
}

async function writeFixtureNotes(notes: StyleNote[]): Promise<void> {
  await AsyncStorage.setItem(FIXTURE_KEY, JSON.stringify(notes));
}

// Added after Javier's OUTFIT_SELECTION_PROMPT (gemini/outfit-planning/prompt.ts),
// which still decides how the outfit is picked. This only asks for a name too.
export const OUTFIT_NAME_INSTRUCTIONS = `Also return:
- name: a short, friendly name for the outfit, 2 to 6 words, written
  for the user, e.g. "Easy layers for class" or "Polished dinner look".
  Base it on the occasion and the pieces chosen. If outfit is empty,
  return an empty name.`;
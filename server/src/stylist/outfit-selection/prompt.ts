// Added after Javier's OUTFIT_SELECTION_PROMPT (gemini/outfit-planning/prompt.ts),
// which still decides how the outfit is picked. This changes the response to
// what the app shows: a name and a list of reasons instead of one reason.
export const OUTFIT_DETAILS_INSTRUCTIONS = `Changes to the response format above:
- Instead of a single reason, return reasons: 2 to 4 short reasons the
  outfit works, one sentence each, written to the user as "you". Cover
  the occasion, and the date or season if it shaped your choices. Never
  mention item ids. If outfit is empty, return one reason saying what's
  missing.
- Also return name: a short, friendly name for the outfit, 2 to 6 words,
  e.g. "Easy layers for class" or "Polished dinner look". If outfit is
  empty, return an empty name.`;

// Sent when the user taps "Try another suggestion": the outfits they've seen.
export function alreadyShownText(shownBefore: string[][]): string {
  return `The user has already seen these outfits (each is a list of item ids).
Don't return any of them again with exactly the same items:
${shownBefore.map((ids) => `- ${ids.join(', ')}`).join('\n')}`;
}
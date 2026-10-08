import { RECENT_TURNS_IN_FULL } from '../gemini/constants';

// What the history needs from a turn.
export type HistoryTurn = {
  turnNumber: number;
  route: string;
  userMessage: string;
  chosenItemIds: string[];
  name: string | null;
};

// Splits a session's usable turns (oldest first, failed ones left out) into
// the last few, shown in full, and the older ones not summarized yet.
// summarizedThrough is what summarizedThroughTurn becomes once they are.
export function historyWindow<T extends HistoryTurn>(
  turns: T[],
  summarizedThroughTurn: number,
  recentCount = RECENT_TURNS_IN_FULL,
): { recent: T[]; toSummarize: T[]; summarizedThrough: number }
{
  const older = turns.length > recentCount ? turns.slice(0, turns.length - recentCount) : [];
  return {
    recent: turns.slice(-recentCount),
    toSummarize: older.filter((turn) => turn.turnNumber > summarizedThroughTurn),
    summarizedThrough: older.length > 0 ? older[older.length - 1].turnNumber : summarizedThroughTurn,
  };
}

// What the user said about a turn's outfit: the next turn's message ('' for
// a plain reroll, null if nothing came after it yet).
export function replyTo<T extends HistoryTurn>(turns: T[], turn: T): string | null
{
  const next = turns[turns.indexOf(turn) + 1];
  return next ? next.userMessage : null;
}

// The conversation so far, for the selection prompt, e.g.
//   Turn 1: you suggested "Easy layers for class": Grey tee, Navy chinos, White sneakers.
//   The user said: "different shoes".
//   Turn 2: you suggested ...
//   Now the user says: "more formal".
export function formatHistory(input: {
  summary: string | null;
  recent: HistoryTurn[];
  itemNames: Map<string, string>;
  message: string;
}): string
{
  const lines = ['The conversation so far:'];
  if (input.summary) lines.push(`Earlier in this conversation: ${input.summary}`);
  for (const turn of input.recent) {
    // A turn's message is what led to it; turn 1's is the original request.
    if (turn.route !== 'initial') lines.push(userLine(turn.userMessage));
    const items = turn.chosenItemIds.map((id) => input.itemNames.get(id)).filter(Boolean).join(', ');
    lines.push(`Turn ${turn.turnNumber}: you suggested "${turn.name ?? 'Untitled'}": ${items || '(items since removed)'}.`);
  }
  lines.push(input.message
    ? `Now the user says: "${input.message}". Suggest something new that follows this.`
    : 'Now the user asks for another option. Suggest something new.');
  return lines.join('\n');
}

function userLine(message: string): string
{
  return message ? `The user said: "${message}".` : 'The user asked for another option.';
}

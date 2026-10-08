import { Injectable } from '@nestjs/common';
import { FAST_MODEL } from '../constants';
import { GeminiHelpers } from '../helpers';
import { HISTORY_SUMMARY_PROMPT } from './prompt';

// An older turn, as the summary sees it.
export type SummaryTurn = {
  turnNumber: number;
  outfitName: string | null;
  itemNames: string[];
  userReply: string | null; // what the user said about this outfit, if anything
};

// Stylist reprompts: compresses turns that fell out of the last few into a
// short summary, so long conversations stay cheap. Uses the fast model.
@Injectable()
export class HistorySummaryService {
  constructor(private readonly helpers: GeminiHelpers)
  {}

  async summarize(previousSummary: string | null, turns: SummaryTurn[]): Promise<string>
  {
    const turnLines = turns.map((turn) => {
      const outfit = `"${turn.outfitName ?? 'Untitled'}": ${turn.itemNames.join(', ') || '(items removed)'}`;
      const reply = turn.userReply ? ` The user then said: "${turn.userReply}".` : ' The user asked for another option.';
      return `Turn ${turn.turnNumber}: the assistant suggested ${outfit}.${reply}`;
    });
    const prompt = `${HISTORY_SUMMARY_PROMPT}

Current summary:
${previousSummary || '(none)'}

Older turns:
${turnLines.join('\n')}`;

    const response = await this.helpers.ai.models.generateContent({ model: FAST_MODEL, contents: prompt });
    const summary = response.text?.trim();
    if (!summary) throw new Error('History summary came back empty');
    return summary;
  }
}

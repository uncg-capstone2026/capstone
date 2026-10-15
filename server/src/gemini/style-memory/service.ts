import { Injectable, Logger } from '@nestjs/common';
import { AI_LOG_CONTEXT } from '../../logger.config';
import { FAST_MODEL, MAX_MEMORY_FACTS } from '../constants';
import { GeminiHelpers, seconds, tokenCounts } from '../helpers';
import { STYLE_MEMORY_PROMPT } from './prompt';
import { STYLE_MEMORY_RESPONSE_SCHEMA } from './schema';

// One finished Stylist session, as the memory prompt sees it.
export type MemorySession = {
  request: string; // the original request
  turns: {
    turnNumber: number;
    userMessage: string; // what the user said to get this outfit ('' for "Try another")
    outfitName: string | null;
    itemNames: string[]; // e.g. "Navy crew-neck sweater (sweater)"
  }[];
  acceptedTurn: number | null; // null when the user left without choosing one
  feedback: string[]; // "What would you rather wear?" answers
  existingNotes: string[];
};

// The memory job: what a finished Stylist session shows about the user's
// lasting style, as short facts to save as Learned notes. Uses the fast model.
@Injectable()
export class StyleMemoryService {
  // Summaries go to the terminal and logs/ai/; .debug (full output) to logs/ai/ only.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

  constructor(private readonly helpers: GeminiHelpers)
  {}

  // Up to MAX_MEMORY_FACTS facts, or none.
  async extractFacts(session: MemorySession): Promise<string[]>
  {
    const prompt = `${STYLE_MEMORY_PROMPT.replace('{max_facts}', String(MAX_MEMORY_FACTS))}

${describeSession(session)}`;

    const started = Date.now();
    let text = '';
    try {
      const result = await this.helpers.generateJson(prompt, STYLE_MEMORY_RESPONSE_SCHEMA, FAST_MODEL);
      const durationMs = Date.now() - started;
      text = result.text;

      let parsed: { facts?: unknown };
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`Gemini returned invalid JSON: ${text || '(empty)'}`);
      }
      const facts = (Array.isArray(parsed.facts) ? parsed.facts : [])
        .filter((fact): fact is string => typeof fact === 'string')
        .map((fact) => fact.trim())
        .filter(Boolean)
        .slice(0, MAX_MEMORY_FACTS);

      this.aiLogger.log({
        message: 'style memory',
        model: FAST_MODEL,
        modelVersion: result.modelVersion,
        durationMs,
        seconds: seconds(durationMs),
        tokens: tokenCounts(result.usage),
        facts: facts.length,
      });
      this.aiLogger.debug({ message: 'style memory output', prompt, output: facts });
      return facts;
    } catch (err) {
      this.aiLogger.error(`style memory failed: ${(err as Error).message}`, (err as Error).stack);
      if (text) this.aiLogger.debug({ message: 'style memory failed output', output: text });
      throw err;
    }
  }
}

// e.g.
//   User request: "something for class"
//   Turn 1: suggested "Easy layers": Grey tee (t-shirt), Navy chinos (dress-pants).
//   Turn 2: the user said "different shoes", then suggested ...
//   Ending: the user chose turn 2.
function describeSession(session: MemorySession): string
{
  const turns = session.turns.map((turn) => {
    const outfit = `"${turn.outfitName ?? 'Untitled'}": ${turn.itemNames.join(', ') || '(items removed)'}`;
    if (turn.turnNumber === 1) return `Turn 1: suggested ${outfit}.`;
    const said = turn.userMessage ? `the user said "${turn.userMessage}"` : 'the user asked for another option';
    return `Turn ${turn.turnNumber}: ${said}, then suggested ${outfit}.`;
  });
  const ending = session.acceptedTurn === null
    ? 'Ending: the user left without choosing an outfit.'
    : `Ending: the user chose turn ${session.acceptedTurn}.`;
  const feedback = session.feedback.length > 0
    ? session.feedback.map((text) => `- "${text}"`).join('\n')
    : '(none)';
  const notes = session.existingNotes.length > 0
    ? session.existingNotes.map((text) => `- ${text}`).join('\n')
    : '(none)';

  return `User request: "${session.request}"
${turns.join('\n')}
${ending}

Feedback on outfits they turned down:
${feedback}

Existing notes:
${notes}`;
}

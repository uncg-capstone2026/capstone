import { Injectable, Logger } from '@nestjs/common';
import { AI_LOG_CONTEXT } from '../../logger.config';
import { CLOTHING_TYPES, FAST_MODEL } from '../constants';
import { GeminiHelpers, seconds, tokenCounts } from '../helpers';
import { REPROMPT_ROUTER_PROMPT } from './prompt';
import { sanitizeRouteDecision, type RawRouteDecision, type RouteDecision } from './sanitize';
import { REPROMPT_ROUTER_RESPONSE_SCHEMA } from './schema';

// Stylist reprompts: decides what a piece of feedback should change
// (reroll, swap, refine or restart). Text only, so it uses the fast model.
@Injectable()
export class RepromptRouterService {
  // Summaries go to the terminal and logs/ai/; .debug (full output) to logs/ai/ only.
  private readonly aiLogger = new Logger(AI_LOG_CONTEXT);

  constructor(private readonly helpers: GeminiHelpers)
  {}

  async route(input: {
    originalPrompt: string;
    currentOutfit: { type: string | null; name: string }[];
    message: string;
  }): Promise<RouteDecision>
  {
    const outfitLines = input.currentOutfit
      .map((piece) => `- ${piece.type ?? 'untagged'}: ${piece.name}`)
      .join('\n');
    const prompt = `${REPROMPT_ROUTER_PROMPT.replace('{available_types}', CLOTHING_TYPES.join(', '))}

Original request: ${input.originalPrompt}
Current outfit:
${outfitLines}
User's message: ${input.message}`;

    const started = Date.now();
    let result: Awaited<ReturnType<GeminiHelpers['generateJson']>>;
    try {
      result = await this.helpers.generateJson(prompt, REPROMPT_ROUTER_RESPONSE_SCHEMA, FAST_MODEL);
    } catch (err) {
      this.aiLogger.error(`reprompt router failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
    const durationMs = Date.now() - started;

    let raw: RawRouteDecision;
    try {
      raw = JSON.parse(result.text);
    } catch {
      // Unreadable answer: the full pipeline is the safe fallback.
      this.aiLogger.warn('reprompt router returned invalid JSON, restarting');
      this.aiLogger.debug({ message: 'reprompt router failed output', userMessage: input.message, output: result.text });
      raw = { route: 'restart' };
    }
    const currentTypes = input.currentOutfit
      .map((piece) => piece.type)
      .filter((type): type is string => type !== null);
    const decision = sanitizeRouteDecision(raw, currentTypes);

    this.aiLogger.log({
      message: 'reprompt router',
      model: FAST_MODEL,
      modelVersion: result.modelVersion,
      durationMs,
      seconds: seconds(durationMs),
      tokens: tokenCounts(result.usage),
      rawRoute: raw.route,
      route: decision.route,
      adjusted: wasAdjusted(raw, decision),
    });
    this.aiLogger.debug({
      message: 'reprompt router output',
      originalPrompt: input.originalPrompt,
      currentOutfit: outfitLines,
      userMessage: input.message,
      output: raw,
      decision,
    });
    return decision;
  }
}

// Whether sanitizeRouteDecision changed the route or what it acts on.
function wasAdjusted(raw: RawRouteDecision, decision: RouteDecision): boolean
{
  if (raw.route !== decision.route) return true;
  if (decision.route === 'swap') {
    return JSON.stringify(decision.swapTypes) !== JSON.stringify(raw.swap_types ?? []);
  }
  if (decision.route === 'refine') {
    const edits = raw.edits ?? {};
    const asReturned = {
      add: edits.add ?? [],
      remove: edits.remove ?? [],
      change: edits.change ?? [],
      keepRest: edits.keep_rest !== false,
    };
    return JSON.stringify(asReturned) !== JSON.stringify(decision.edits);
  }
  return false;
}

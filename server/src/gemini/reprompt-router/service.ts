import { Injectable } from '@nestjs/common';
import { CLOTHING_TYPES, FAST_MODEL } from '../constants';
import { GeminiHelpers } from '../helpers';
import { REPROMPT_ROUTER_PROMPT } from './prompt';
import { sanitizeRouteDecision, type RawRouteDecision, type RouteDecision } from './sanitize';
import { REPROMPT_ROUTER_RESPONSE_SCHEMA } from './schema';

// Stylist reprompts: decides what a piece of feedback should change
// (reroll, swap, refine or restart). Text only, so it uses the fast model.
@Injectable()
export class RepromptRouterService {
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

    const text = await this.helpers.generateJson(prompt, REPROMPT_ROUTER_RESPONSE_SCHEMA, FAST_MODEL);
    let raw: RawRouteDecision;
    try {
      raw = JSON.parse(text);
    } catch {
      // Unreadable answer: the full pipeline is the safe fallback.
      raw = { route: 'restart' };
    }
    const currentTypes = input.currentOutfit
      .map((piece) => piece.type)
      .filter((type): type is string => type !== null);
    return sanitizeRouteDecision(raw, currentTypes);
  }
}

import { Type, type Schema } from '@google/genai';
import { CLOTHING_TYPES } from '../constants';

export const REPROMPT_ROUTES = ['reroll', 'swap', 'refine', 'restart'] as const;

const searchItem: Schema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: [...CLOTHING_TYPES] },
    semantic_query: { type: Type.STRING },
  },
  required: ['type', 'semantic_query'],
  propertyOrdering: ['type', 'semantic_query'],
};

// route is limited to the four routes, and every type to CLOTHING_TYPES.
// The answer is still checked in code (see sanitize.ts).
export const REPROMPT_ROUTER_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    route: { type: Type.STRING, enum: [...REPROMPT_ROUTES] },
    swap_types: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...CLOTHING_TYPES] } },
    edits: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        add: { type: Type.ARRAY, items: searchItem },
        remove: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...CLOTHING_TYPES] } },
        change: { type: Type.ARRAY, items: searchItem },
        keep_rest: { type: Type.BOOLEAN },
      },
      required: ['add', 'remove', 'change', 'keep_rest'],
      propertyOrdering: ['add', 'remove', 'change', 'keep_rest'],
    },
  },
  required: ['route', 'swap_types', 'edits'],
  propertyOrdering: ['route', 'swap_types', 'edits'],
};

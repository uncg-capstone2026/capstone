import { Type, type Schema } from '@google/genai';
import { MAX_MEMORY_FACTS } from '../constants';

// facts may be empty: most sessions teach nothing lasting.
export const STYLE_MEMORY_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    facts: {
      type: Type.ARRAY,
      maxItems: String(MAX_MEMORY_FACTS),
      items: { type: Type.STRING },
    },
  },
  required: ['facts'],
  propertyOrdering: ['facts'],
};

import { Type, type Schema } from '@google/genai';
import { CLOTHING_TYPES } from '../constants';

// Only items is returned: each type and semantic_query drives one pgvector
// search. Season, formality and colors are left to the outfit selection step,
// which sees the request, the weather and the photos.
export const QUERY_EXPANSION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      minItems: '1',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [...CLOTHING_TYPES],
          },
          semantic_query: { type: Type.STRING },
        },
        required: ['type', 'semantic_query'],
        propertyOrdering: ['type', 'semantic_query'],
      },
    },
  },
  required: ['items'],
  propertyOrdering: ['items'],
};

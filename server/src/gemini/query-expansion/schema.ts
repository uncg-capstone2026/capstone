import { Type, type Schema } from '@google/genai';
import {
  CLOTHING_TYPES,
  FORMALITY_LEVELS,
  SEASONS,
} from '../constants';

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
    season: {
      type: Type.STRING,
      nullable: true,
      enum: [...SEASONS],
    },
    formality: {
      type: Type.STRING,
      nullable: true,
      enum: [...FORMALITY_LEVELS],
    },
    preferred_colors: { type: Type.ARRAY, items: { type: Type.STRING } },
    exclude_colors: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'items',
    'season',
    'formality',
    'preferred_colors',
    'exclude_colors',
  ],
  propertyOrdering: [
    'items',
    'season',
    'formality',
    'preferred_colors',
    'exclude_colors',
  ],
};

import { Type, type Schema } from '@google/genai';
import {
  ALL_CUTS,
  CLOTHING_TYPES,
  FITS,
  FORMALITY_LEVELS,
  PATTERNS,
  SEASONS,
} from '../constants';

export const IMAGE_ATTRIBUTES_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING, enum: [...CLOTHING_TYPES] },
    colorHex: {
      type: Type.ARRAY,
      minItems: '1',
      maxItems: '3',
      items: { type: Type.STRING },
    },
    pattern: { type: Type.STRING, nullable: true, enum: [...PATTERNS] },
    material: { type: Type.STRING, nullable: true },
    season: { type: Type.STRING, nullable: true, enum: [...SEASONS] },
    formality: {
      type: Type.STRING,
      nullable: true,
      enum: [...FORMALITY_LEVELS],
    },
    cut: { type: Type.STRING, enum: ALL_CUTS },
    fit: { type: Type.STRING, enum: [...FITS] },
  },
  required: [
    'name',
    'type',
    'colorHex',
    'pattern',
    'material',
    'season',
    'formality',
    'cut',
    'fit',
  ],
  propertyOrdering: [
    'name',
    'type',
    'colorHex',
    'pattern',
    'material',
    'season',
    'formality',
    'cut',
    'fit',
  ],
};

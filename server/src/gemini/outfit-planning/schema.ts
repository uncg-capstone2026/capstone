import { Type, type Schema } from '@google/genai';
import { OUTFITS_PER_SELECTION } from '../constants';

// Built per request: the enum limits the model to the candidate ids it was
// actually sent, so it can't invent an item. With no candidates to choose
// from (only fixed pieces), each outfit's list must stay empty. An empty
// outfits list means no complete outfit could be built; missing says why.
// outfit comes first so the name and reasons describe the pieces chosen.
export function buildOutfitSelectionSchema(ids: string[]): Schema
{
  const outfit: Schema = ids.length > 0
    ? { type: Type.ARRAY, minItems: '0', maxItems: '5', items: { type: Type.STRING, enum: [...ids] } }
    : { type: Type.ARRAY, maxItems: '0', items: { type: Type.STRING } };

  return {
    type: Type.OBJECT,
    properties: {
      outfits: {
        type: Type.ARRAY,
        minItems: '0',
        maxItems: String(OUTFITS_PER_SELECTION),
        items: {
          type: Type.OBJECT,
          properties: {
            outfit,
            name: { type: Type.STRING },
            reasons: {
              type: Type.ARRAY,
              minItems: '1',
              maxItems: '4',
              items: { type: Type.STRING },
            },
          },
          required: ['outfit', 'name', 'reasons'],
          propertyOrdering: ['outfit', 'name', 'reasons'],
        },
      },
      missing: { type: Type.STRING, nullable: true },
    },
    required: ['outfits', 'missing'],
    propertyOrdering: ['outfits', 'missing'],
  };
}

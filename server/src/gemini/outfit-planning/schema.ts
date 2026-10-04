import { Type, type Schema } from '@google/genai';

// Built per request: the enum limits the model to the candidate ids it was
// actually sent, so it can't invent an item. An empty outfit means no
// complete outfit could be built; reason then says why.
export function buildOutfitSelectionSchema(ids: string[]): Schema
{
  return {
    type: Type.OBJECT,
    properties: {
      outfit: {
        type: Type.ARRAY,
        minItems: '0',
        maxItems: '5',
        items: { type: Type.STRING, enum: [...ids] },
      },
      reason: { type: Type.STRING },
    },
    required: ['outfit', 'reason'],
    propertyOrdering: ['outfit', 'reason'],
  };
}

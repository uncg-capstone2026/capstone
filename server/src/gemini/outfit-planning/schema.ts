import { Type, type Schema } from '@google/genai';

// Built per request: the enum limits the model to the candidate ids it was
// actually sent, so it can't invent an item.
export function buildOutfitSelectionSchema(ids: string[]): Schema
{
  return {
    type: Type.OBJECT,
    properties: {
      outfits: {
        type: Type.ARRAY,
        minItems: '1',
        maxItems: '3',
        items: {
          type: Type.ARRAY,
          minItems: '2',
          maxItems: '5',
          items: { type: Type.STRING, enum: [...ids] },
        },
      },
    },
    required: ['outfits'],
    propertyOrdering: ['outfits'],
  };
}

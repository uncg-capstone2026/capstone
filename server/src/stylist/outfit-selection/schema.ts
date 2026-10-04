import { Type, type Schema } from '@google/genai';

// Like Javier's buildOutfitSelectionSchema, but each outfit also has a name and
// reasons. The enum limits the model to the candidate ids it was sent. itemIds
// comes first so the name and reasons describe the items already chosen.
export function buildStylistSelectionSchema(ids: string[]): Schema
{
  return {
    type: Type.OBJECT,
    properties: {
      outfits: {
        type: Type.ARRAY,
        minItems: '1',
        maxItems: '3',
        items: {
          type: Type.OBJECT,
          properties: {
            itemIds: {
              type: Type.ARRAY,
              minItems: '2',
              maxItems: '5',
              items: { type: Type.STRING, enum: [...ids] },
            },
            name: { type: Type.STRING },
            reasons: {
              type: Type.ARRAY,
              minItems: '2',
              maxItems: '4',
              items: { type: Type.STRING },
            },
          },
          required: ['itemIds', 'name', 'reasons'],
          propertyOrdering: ['itemIds', 'name', 'reasons'],
        },
      },
    },
    required: ['outfits'],
    propertyOrdering: ['outfits'],
  };
}
import { Type, type Schema } from '@google/genai';

// Javier's buildOutfitSelectionSchema, with name and a list of reasons. The
// enum limits the model to the candidate ids it was sent. An empty outfit
// means no complete outfit could be built; reasons then says why. outfit
// comes first so the name and reasons describe the pieces already chosen.
export function buildOutfitSuggestionSchema(ids: string[]): Schema
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
  };
}
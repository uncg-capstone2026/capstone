import { Type, type Schema } from '@google/genai';

// Javier's buildOutfitSelectionSchema plus a name. The enum limits the model
// to the candidate ids it was sent. An empty outfit means no complete outfit
// could be built; reason then says why. outfit comes first so the name and
// reason are written about the pieces already chosen.
export function buildNamedOutfitSchema(ids: string[]): Schema
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
      reason: { type: Type.STRING },
    },
    required: ['outfit', 'name', 'reason'],
    propertyOrdering: ['outfit', 'name', 'reason'],
  };
}
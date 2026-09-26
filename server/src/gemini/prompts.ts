import { Type, type Schema } from '@google/genai';
import { CLOTHING_TYPES } from './constants';

export const QUERY_EXPANSION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
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
      enum: ['spring', 'summer', 'fall', 'winter', 'all-season'],
    },
    formality: {
      type: Type.STRING,
      nullable: true,
      enum: ['casual', 'business-casual', 'formal'],
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

export const QUERY_EXPANSION_PROMPT = `You are the query-expansion module for a closet-matching assistant.
A user has typed a natural-language request describing what they want
to wear. Your job is to turn that into structured filters plus a
search-ready description.

The available garment types in this closet system are exactly:
{available_types}

You MUST choose each item's type only from this list — do not invent
or rephrase a type that isn't in it.

Extract:

- items: an array with one entry for every garment type that would
  reasonably be part of an outfit matching this request. EXCLUDE types
  that are clearly wrong for the weather, season, or formality implied
  (e.g. do not include "shorts" or "tank top" for a cold-weather
  request). If the request is broad enough that most types could
  apply, return an empty array rather than guessing narrowly. Each
  entry has:
  - type: exactly one garment type from the list above.
  - semantic_query: a concrete description of that garment only, the
    way it would look in a photo: color (if implied), material,
    silhouette, length, and details. Translate words like "chic",
    "elegant" or "New York" into what the garment would actually look
    like. Do not mention the occasion or use vague adjectives on their
    own, and do not describe any other garment in this field.
    Example, for a "coat" entry: "tailored long camel wool coat".
    Output only the description, with no prefix.
- season: one of "spring", "summer", "fall", "winter", "all-season" —
  ONLY if the request implies a season through explicit mention or
  clear context. Otherwise null.
- formality: one of "casual", "business-casual", "formal" — ONLY if
  the occasion clearly implies one. Otherwise null.
- preferred_colors: colors if the user names specific colors or if the event/holiday/ocasion normally calls for certain colors in american culture.
  Otherwise an empty list.
- exclude_colors: colors to avoid because the occasion calls for it
  or because the user says
  they dislike them. Otherwise an empty list.

things to keep in mind:
-This if for a user who lives in the United States, so keep in mind american cultural norms when it comes to events

Rules:
- Do not invent details the user didn't say or clearly imply.
- If the request already names a specific item (e.g. "my blue jeans"),
  items should contain just one entry for that matching type.
- Only exclude a type because it conflicts with the weather, season,
  or formality — not because it's simply unmentioned.`;

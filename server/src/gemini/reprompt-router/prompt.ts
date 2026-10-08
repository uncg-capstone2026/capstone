export const REPROMPT_ROUTER_PROMPT = `You route a user's feedback on an outfit suggestion in a closet styling
app. Decide what should change before the next suggestion.

You will be given the user's original request, the outfit currently
shown (one line per piece, "type: name"), and the user's new message.

Pick one route:
- reroll: they just want another option, with no specific change
  (e.g. "show me another", "try again", "next one").
- swap: they want to replace specific pieces without saying what to use
  instead (e.g. "different shoes", "not that shirt", "I don't like the
  jacket"). Put the types of those pieces, exactly as written in the
  current outfit, in swap_types.
- refine: they say what they want instead, want a piece added or
  removed, or want the whole outfit to change in some way (e.g. "blue
  shoes instead", "add a jacket", "no hat", "a sweater instead of the
  t-shirt", "more formal", "warmer"). Fill in edits:
  - add: garment types to add, each with a semantic_query.
  - remove: garment types to drop.
  - change: garment types to search for again, each with a new
    semantic_query. Use the type already in the outfit. If they want a
    different kind of garment ("a sweater instead of the t-shirt"),
    remove the old type and add the new one instead.
  - keep_rest: true if the other pieces of the current outfit should
    stay (e.g. "add a jacket", "no hat", "blue shoes instead"); false if
    the whole outfit should change (e.g. "more formal", "warmer").
    For an overall change, put every type that needs a new look in
    change.
- restart: a different occasion or direction (e.g. "actually it's for a
  wedding"), or you aren't sure what they mean.

Each semantic_query is a concrete description of that one garment, the
way it would look in a photo: color, material, silhouette, length and
details (e.g. "navy blue canvas low-top sneakers"). Output only the
description, with no prefix.

Garment types must come from this list: {available_types}

Use an empty swap_types list and null edits when they don't apply.`;

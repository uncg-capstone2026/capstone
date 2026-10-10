# Reprompting: implementation plan

> Design source: `ai/repromptplan.md`. Where the two differ, this document wins (see "Changes from repromptplan.md").

## Context
`POST /api/stylist/outfit` returns one outfit per request and stores nothing. The current "Try another" is Taylor's stateless workaround: an encoded `suggestionId` plus `excludeSuggestionIds`.

This plan adds **sessions and turns**. A user can react to an outfit ("another", "different shoes", "add a jacket", "more formal") and get a better next one, as cheaply as possible:
- Every outfit shown is a stored turn.
- One selection call returns up to 3 outfits. The extras are queued, so most rerolls need no AI call.
- A small router decides how much of the pipeline to rerun.
- History: the last 5 turns go in full; older turns are summarized by a fast model.
- Accept marks the turn. Taylor's accept route saves the Outfit.

**Scope:** server only (`gemini/`, `stylist/`, `weather/`, Prisma). The client and the accept route get a handoff note.

**Rules:**
- No live Gemini calls during development; the user tests in Bruno.
- Every AI call outside `gemini/` gets an "AI:" comment saying what it does and why.

## Decisions
| Topic | Decision |
|---|---|
| Accept (Flow 3) | `acceptTurn()` only marks the turn and session. Taylor's `POST /api/stylist/outfit/accept` calls it inside the transaction that creates the Outfit + CalendarEntry. |
| Banned items | Items the user asked to replace are hard-banned for the session, and an exact outfit is never repeated. Other items shown before are only soft-avoided in the prompt. |
| Old "Try another" | `POST /outfit` keeps accepting `excludeSuggestionIds` until the client uses the reprompt route. Remove it after that. |
| History | Last 5 turns in full. Older turns are summarized by a small fast model, cached on the session. |
| Outfits per selection | 3, best first. Extras are queued on the session for rerolls. |
| Candidates | The search keeps 10 per type, stored with scores. 4 per type are sent to Gemini. No total cap. |
| Routes | `reroll`, `swap`, `refine`, `restart`, plus `initial` for turn 1 |
| Models | Expansion and selection: `gemini-flash-latest` (`MAIN_MODEL`). Router and history summary: `gemini-flash-lite-latest` (`FAST_MODEL`). Confirm the alias in AI Studio. |

## Changes from repromptplan.md
- `reasoning` becomes `name` + `reasons[]` (2–4), which is what the app shows.
- Item ids are uuid strings, so `String[]`, not `int[]`.
- Routes:
  - `repick` → `reroll`
  - `swap_category` → `swap`
  - `patch_requirements` → `refine`, which also covers adding and removing a type
  - `restart` stays
- `requirements` is the expansion's `items` list (`{ type, semantic_query }[]`). The expansion no longer returns formality or season.
- Candidates are grouped by garment type (what the search uses): 10 stored, 4 sent.
- Response: the app's existing `OutfitSuggestion` plus `sessionId` and `turnId`.
- "Rejected item IDs across all turns" is narrowed to blamed items only (see Decisions).
- The reprompt endpoint is `POST /api/stylist/outfit/reprompt { sessionId, message? }`.
- `saved_outfits` is the existing `Outfit` model, created by Taylor's accept route.

## Gemini calls per request
| Request | Calls |
|---|---|
| First prompt | expansion + embed + selection (3) |
| reroll, queue has outfits | 0 |
| reroll, queue empty | selection (1), plus embed if candidates run out |
| swap | router + selection (2) |
| refine | router + embed + selection (3) |
| restart | router + expansion + embed + selection (4) |
| Any reprompt after a turn falls out of the last 5 | + history summary (fast model, run in parallel with the router) |

## Data model (Prisma)
```prisma
enum OutfitSessionStatus { active completed abandoned }
enum OutfitTurnRoute { initial reroll swap refine restart }
enum OutfitTurnStatus { pending rejected accepted failed }

model OutfitSession {
  id                    String              @id @default(uuid())
  userId                String
  user                  User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  originalPrompt        String
  date                  String?             // 'YYYY-MM-DD' the outfit is for
  weather               Json?               // forecast snapshot from turn 1
  status                OutfitSessionStatus @default(active)
  acceptedTurnId        String?             @unique
  acceptedTurn          OutfitTurn?         @relation("AcceptedTurn", fields: [acceptedTurnId], references: [id])
  queuedOutfits         Json                @default("[]") // [{ itemIds, name, reasons }] extras for reroll
  bannedItemIds         String[]            // items the user asked to replace; never suggested again here
  historySummary        String?             // turns older than the last 5, compressed
  summarizedThroughTurn Int                 @default(0)
  memoryProcessed       Boolean             @default(false) // for the later memory job
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt
  turns                 OutfitTurn[]        @relation("SessionTurns")

  @@index([userId, updatedAt])
}

model OutfitTurn {
  id            String           @id @default(uuid())
  sessionId     String
  session       OutfitSession    @relation("SessionTurns", fields: [sessionId], references: [id], onDelete: Cascade)
  turnNumber    Int
  userMessage   String           // the original prompt (turn 1), the feedback, or '' for a plain reroll
  route         OutfitTurnRoute
  requirements  Json             // { items: [{ type, semantic_query }] }
  candidates    Json             // { [type]: [{ itemId, score }] }, closest first, up to 10 per type
  sentItemIds   String[]
  chosenItemIds String[]
  name          String?
  reasons       String[]
  status        OutfitTurnStatus @default(pending)
  error         String?          // why a failed turn failed
  createdAt     DateTime         @default(now())
  acceptedIn    OutfitSession?   @relation("AcceptedTurn")

  @@unique([sessionId, turnNumber])
}
```
- Add `outfitSessions OutfitSession[]` to `User`.
- Embeddings aren't stored. When a re-search needs one, the stored `semantic_query` is embedded again (one cheap call).
- **Migration:** `npx prisma migrate dev --create-only --name outfit_sessions`, review the SQL, then apply it. The user runs this against their database.

## Endpoints
- **`POST /api/stylist/outfit`** (Flow 1). The body is unchanged: `{ occasion, date?, lat?, lon?, excludeSuggestionIds? }`. The response is `OutfitSuggestion` plus `sessionId` and `turnId`.
- **`POST /api/stylist/outfit/reprompt`** (Flow 2). The body is `{ sessionId, message? }`, with `message` up to 300 characters. Same response shape.
- **Accept:** no route of ours. `StylistSessionsService.acceptTurn(userId, sessionId, turnId, tx?)` is exported for Taylor's route.
- **Errors:**
  - 400: bad body
  - 404: session not found, or not the user's
  - 409: session not active, or a reprompt already in progress (turn-number clash)
  - 422: not enough items, no new outfits, or turn limit reached (20)
  - 503: Gemini failure, with a `message`

## Code layout
```
server/src/gemini/
  constants.ts                + CANDIDATES_STORED_PER_TYPE=10, CANDIDATES_SENT_PER_TYPE=4, OUTFITS_PER_SELECTION=3,
                                RECENT_TURNS_IN_FULL=5, MAX_TURNS_PER_SESSION=20, MAIN_MODEL, FAST_MODEL
                              − CANDIDATES_PER_TYPE, MAX_OUTFIT_CANDIDATES
  outfit-planning/
    prompt.ts                 one selection prompt (several outfits, name, reasons, optional sections)
    schema.ts                 buildOutfitSelectionSchema(ids)
    candidates.ts             pure helpers: pickToSend, comboKey, isCompleteOutfit, validateOutfits (unit tested)
    service.ts                findCandidates (scores, exclusions), loadCandidates, selectOutfits
  reprompt-router/            prompt.ts, schema.ts, service.ts → RepromptRouterService.route()
  history-summary/            prompt.ts, service.ts → HistorySummaryService.summarize()
server/src/stylist/
  stylist.controller.ts       + POST outfit/reprompt
  stylist.dto.ts              + RepromptDto
  stylist-sessions.service.ts Prisma reads/writes for sessions and turns, acceptTurn
  stylist.service.ts          startSession (Flow 1), reprompt (Flow 2), one handler per route
  outfit-suggestion.ts        toSuggestion(): display order, signed URLs, suggestionId (moved out of stylist.service.ts)
  outfit-selection/           deleted (merged into gemini/outfit-planning)
```

## Phases
Each phase compiles, keeps the app working, and can be committed and tested on its own.

### Phase 0: Groundwork ✅ done
- Add the constants above.
- `findClosestItems` uses `LIMIT CANDIDATES_STORED_PER_TYPE`. Remove the 25-item total cap and its `slice`.
- Add a line to the expansion prompt: "list only the types one outfit would draw from, usually 4–7".
- Replace the hard-coded `'gemini-flash-latest'` strings with `MAIN_MODEL`.
- **503s:** in `StylistService`, errors from AI steps that aren't `HttpException`s are logged and rethrown as `ServiceUnavailableException({ message: 'StyleMe could not put an outfit together right now. Please try again.' })`. The client already shows 503 messages.

### Phase 1: One selection prompt, up to 3 outfits ✅ done
- **`prompt.ts`**, rewritten.
  - Inputs, in order:
    - the request
    - the weather line
    - optional: the history
    - optional: fixed pieces, with photos
    - optional: outfits never to repeat, and items shown before
    - the candidates: details line + photo
  - Returns `{ outfits: [{ outfit, name, reasons }], missing }`:
    - Up to 3 complete outfits, best first. Each differs from the others by at least 2 pieces, or by a different top, bottoms or one-piece.
    - Fixed pieces count toward completeness. Never return their ids.
    - `name`: 2–6 words.
    - `reasons`: 2–4 sentences of one line each, written to "you". Never mention ids. Cover the occasion, and the weather if it shaped the choices.
    - `missing`: when `outfits` is empty, one sentence saying what the closet lacks.
- **`schema.ts`**:
  - A per-request enum of the candidate ids.
  - `outfits` maxItems 3; each outfit's items maxItems 5; `reasons` 1–4.
  - With no choosable ids (a refine that only removes a type), outfit `maxItems: 0`.
- **`candidates.ts`**:
  - `comboKey(ids)`: sorted ids, base64url. This is today's `suggestionId` encoding, so old ids stay valid.
  - `isCompleteOutfit`.
  - `validateOutfits(raw, { candidates, fixed, shownKeys, banned })`:
    - drops unknown and duplicate ids
    - merges in the fixed pieces
    - drops outfits that are incomplete, repeated or contain a banned item
    - dedupes across the batch
    - trims reasons to 4
- **`service.ts`**: `selectOutfits({ request, weather, candidates, fixed?, history?, shownKeys?, softAvoidIds?, banned? })` → `{ outfits, missing }`.
- **Delete:**
  - `planOutfit`, `selectOutfit`, `PlannedOutfit` and the old schema
  - the `QueryExpansionService` injection in `OutfitPlanningService`
  - `stylist/outfit-selection/`
  - `GeminiHelpers` from `StylistModule`'s providers
- **Flow 1** uses `selectOutfits` and returns the first outfit. Extras are discarded until Phase 2. `excludeSuggestionIds` become `shownKeys`.
- **Check:** same response shape, with a name and 2–4 reasons.

### Phase 2: Sessions and turns (Flow 1 saves) ✅ done
- Prisma models, migration, `prisma generate`.
- **`StylistSessionsService`**:
  - `createSession(...)`: creates the session and turn 1 in one transaction.
  - `getActiveSession(userId, id)`.
  - `latestTurn(sessionId)`: the latest turn whose status isn't `failed`.
  - `turns(sessionId)`.
  - `recordTurn(...)`: one transaction that marks the previous turn rejected, inserts the new turn, and updates the session's queue, bans and summary.
  - `recordFailedTurn(...)`.
  - `acceptTurn(...)` (filled in during Phase 6).
- **Flow 1:**
  1. weather → expand → `findCandidates` (10 per type) → `pickToSend` (4 per type) → `selectOutfits`.
  2. Save the session (original prompt, date, weather, queue = outfits 2–3) and turn 1 (route `initial`).
  3. Respond with `sessionId` and `turnId`.
  - Nothing valid on turn 1 → 422, and no session is saved.
- **`outfit-suggestion.ts`**: `toSuggestion(items)` works from Item rows (name, category, type, photo key), so queue pops never download photos.

### Phase 3: Reprompt endpoint with reroll ✅ done
- `POST /outfit/reprompt`: load the session (404 / 409) and check the turn limit (422).
- An empty message goes to `reroll`. Until Phase 4, a non-empty message is treated as `restart`.
- **reroll:**
  1. **Queue:** pop entries until one has all its items still in the closet, none banned, and a combination not shown before. That becomes a new turn (route `reroll`), with requirements, candidates and `sentItemIds` copied from the previous turn. No AI call.
  2. **Queue empty:** build a new batch.
     - `pickToSend` from the stored candidates. Per type: up to 2 of the best already-sent items (so good pieces can be recombined), then the next unsent ones, up to 4 total, minus banned items.
     - `shownKeys` from every turn, plus the last 5 turns as history.
     - `selectOutfits`. The first outfit is the turn; the rest are queued.
  3. **Nothing new:**
     - Embed the stored semantic queries again, search excluding every stored candidate id, add the results to the stored lists, and retry once.
     - Still nothing → 422: "That's every outfit StyleMe can find for this. Try describing the occasion differently."
- **History block** (last 5 non-failed turns), for example: "Turn 2: you suggested 'Easy layers for class': White sneakers, Navy chinos, Grey tee. The user said: 'different shoes'."
- **Failures:** insert a `failed` turn with the error. The previous turn stays the latest usable one.

### Phase 4: Router (swap, refine, restart) ✅ done
- **reprompt-router** (`FAST_MODEL`):
  - **Input:** original prompt, current outfit (`type: item name`), message, available types.
  - **Output:**
    ```ts
    { route: 'reroll' | 'swap' | 'refine' | 'restart',
      swap_types: string[],          // types in the current outfit to replace
      edits: { add: { type, semantic_query }[], remove: string[],
               change: { type, semantic_query }[], keep_rest: boolean } | null }
    ```
  - **Prompt rules:**
    - `swap`: replace a piece without describing the replacement ("different shoes").
    - `refine`: describes what they want, adds or removes a type, or changes the whole outfit ("blue shoes", "add a jacket", "no hat", "more formal").
    - `restart`: a new occasion, or unclear.
  - **Sanitize:** `swap_types` must be in the current outfit, and edit types must be in `CLOTHING_TYPES`. Otherwise use `restart`.
- **swap:**
  - Ban the current items of `swap_types`.
  - Fixed pieces: the rest of the current outfit.
  - Choices: the next stored candidates for those types (unbanned, 4). If none are left, search that type again, excluding banned and stored items.
  - `selectOutfits` with the fixed pieces. Alternatives are queued, so a later reroll gives the next alternative with the same fixed pieces.
- **refine:**
  - Update the requirements: drop `remove` types, add `add` types, and replace the `semantic_query` for `change` types.
  - Embed the add and change queries in one call. Search those types (10 each), replacing their candidate lists. Drop the removed types' lists.
  - **`keep_rest: true`:** fixed pieces are the current items whose type wasn't removed or changed. Ban the current items of changed types. Choices are the new types' candidates.
  - **`keep_rest: false`:** no fixed pieces; a full selection over the updated candidates.
  - The queue is replaced with the new alternatives.
- **restart:**
  - Expansion input: the original prompt (and date) + "\nThe user then said: <message>".
  - Uses the session's stored weather. Fresh search. Bans are kept. The queue is replaced.
- Every route except `reroll` replaces the queue.

### Phase 5: History summary ✅ done
- **history-summary** (`FAST_MODEL`, plain text, at most 5 short lines):
  - **Input:** the previous summary plus the turns that fell out of the last 5 (route, message, chosen item names).
  - **Keep:** what was turned down and why, and stated preferences (colors, formality, fit, pieces they liked).
  - **No ids:** bans and repeated outfits are enforced in code.
- **When:** if the latest turn number − 5 > `summarizedThroughTurn`, summarize the gap. Run it alongside the router (`Promise.all`). On failure, log it and keep the old summary.
- The selection prompt gets "Earlier in this conversation: <summary>" before the last-5 block.

### Phase 6: Accept hook, handoff, docs ✅ done
- **`acceptTurn(userId, sessionId, turnId, tx?)`:**
  - Check ownership. The turn must be the latest pending one.
  - Turn → accepted. Session → completed, with `acceptedTurnId` set and the queue cleared.
  - Takes an optional Prisma transaction client.
  - Export `StylistSessionsService` from `StylistModule`.
- **Handoffs (client side now in `ai/frontend-handoff.md`):**
  - **Client:**
    - Keep `sessionId` and `turnId` from responses.
    - "Try another" → reprompt with `{ sessionId }`.
    - "Not for me" feedback → reprompt with `{ sessionId, message }`, then show the returned outfit.
    - The accept body adds `sessionId` and `turnId`.
    - Stop sending `excludeSuggestionIds`.
    - List the error codes.
    - This replaces the planned `/outfit/feedback` route; turns store the feedback for the memory job.
  - **Accept route:** calls `acceptTurn` inside the Outfit + CalendarEntry transaction (done; `sessionId` and `turnId` are required).
- Update `server/CLAUDE.md`: endpoints and response shape. This also replaces its out-of-date `PlannedOutfit` section.
- Add `[DEBUG AI]` logs (in "DELETE LATER" blocks) for the route chosen, queue pops and AI calls made.

## Later (not in this plan)
- Remove `excludeSuggestionIds` and `fromSuggestionId` once the client switches.
- **Memory job:** reads sessions with `memoryProcessed = false`.
- **Abandoned sessions:** mark active sessions with no activity for N hours as abandoned.
- More routes (`keep`, `use_item`, `change_date`), `excludeFromSuggestions`, style preferences.

## Verification
- **Every phase:** `cd server && npx tsc --noEmit` and `npm run lint` (oxlint).
- **Unit tests** (jest, no AI calls):
  - `candidates.ts`: `pickToSend`; `comboKey`; `validateOutfits`, including merging fixed pieces, banned items and repeated outfits
  - router output sanitizing
  - the history window math
- **Manual Bruno pass** by the user (live Gemini):
  1. `POST /outfit` → `sessionId`, `turnId`, a name and 2–4 reasons.
  2. Reprompt with `{ sessionId }` twice: instant, with no Gemini log (served from the queue). The third time: a new batch, with no repeats.
  3. "different shoes": the other pieces stay, the shoes change. Then reroll: the next shoes, same other pieces.
  4. "add a jacket": the same outfit plus a jacket. "more formal": a new outfit.
  5. "actually it's for a wedding": restart.
  6. Another user's `sessionId` → 404. The 21st turn → 422. Reroll until there's nothing left → the 422 message.
- **DB check:** turn rows and statuses (previous turn rejected, latest pending), and the queue shrinking.

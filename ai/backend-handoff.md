# Backend handoff: accept closes the Stylist session

**From:** Javier (AI / server). **For:** Taylor (owner of `/outfit/accept` and `/outfit/feedback`).

The Stylist now saves every suggestion as a turn in a session (`OutfitSession` / `OutfitTurn`), and `POST /api/stylist/outfit/reprompt` returns the next outfit in that session.
- Design: `ai/repromptimplementation.md`
- API: `server/CLAUDE.md`

When the user accepts an outfit, the session needs to know: the accepted turn is marked and the session is closed. That's what the memory job will learn from later. Right now accept saves the Outfit but leaves the session `active` and the turn `pending`.

## 1. `AcceptOutfitDto`: add the two ids
`server/src/stylist/outfit-feedback.dto.ts`. They're optional, so the current app keeps working until the client sends them:
```ts
// From the suggestion being accepted (POST /outfit or /outfit/reprompt).
@IsOptional()
@IsUUID()
sessionId?: string;

@IsOptional()
@IsUUID()
turnId?: string;
```
Without these, the route's `forbidNonWhitelisted` pipe rejects them with 400, so the client is holding off on sending them until this lands.

## 2. `OutfitFeedbackService.accept`: call `acceptTurn` in the transaction
`server/src/stylist/outfit-feedback.service.ts`. `StylistSessionsService` is already provided in `StylistModule`, so just inject it:
```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly outfits: OutfitsService,
  private readonly stylistSessions: StylistSessionsService,
) {}
```
Inside the existing `$transaction`, before creating the Outfit:
```ts
if (dto.sessionId && dto.turnId) {
  await this.stylistSessions.acceptTurn(userId, dto.sessionId, dto.turnId, tx);
}
```
What `acceptTurn(userId, sessionId, turnId, tx)` does:
- **Checks:**
  - 404 if the session isn't the user's.
  - 409 if the session is already finished.
  - 409 if `turnId` isn't the latest suggestion.

  Because it runs in `tx`, a failed check rolls back the Outfit and CalendarEntry too.
- **Updates:** the turn becomes `accepted`, and the session becomes `completed`, with `acceptedTurnId` set and its queue cleared.
- **Returns** `{ chosenItemIds, name }` for that turn, if you want to check the client's `itemIds` against what was actually suggested.

## 3. `/outfit/feedback`: no change for now
It overlaps with reprompt-with-a-message: both start from "Not for me". The app keeps calling both for now.
- `/feedback` logs `StyleFeedback`.
- `/reprompt` returns the next outfit and stores the message on the turn.

We'll decide together later whether reprompt replaces it, or also writes the `StyleFeedback` row.

## 4. Database
Migration `20261007160000_outfit_sessions` is already applied to the shared database. Pull before creating new migrations so yours are timestamped after it.

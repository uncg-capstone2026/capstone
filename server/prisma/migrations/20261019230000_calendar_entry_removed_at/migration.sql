-- Unscheduling a day now marks it removed instead of deleting it, so a day
-- that was already counted as worn keeps its date for lastWorn.
ALTER TABLE "CalendarEntry" ADD COLUMN "removedAt" TIMESTAMP(3);
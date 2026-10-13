-- "Didn't wear it": true when the user says they didn't wear the outfit that
-- day. The hourly wear-tracking job skips these days.
ALTER TABLE "CalendarEntry" ADD COLUMN "notWorn" BOOLEAN NOT NULL DEFAULT false;
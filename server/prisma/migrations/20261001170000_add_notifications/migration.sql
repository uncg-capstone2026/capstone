-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('OutfitReminder', 'WeatherAlert', 'EventReminder', 'System');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarEntryId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_scheduledFor_idx" ON "Notification"("userId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_scheduledFor_sentAt_idx" ON "Notification"("scheduledFor", "sentAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_calendarEntryId_fkey" FOREIGN KEY ("calendarEntryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
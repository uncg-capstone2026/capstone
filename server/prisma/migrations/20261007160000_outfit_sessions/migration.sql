-- CreateEnum
CREATE TYPE "OutfitSessionStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "OutfitTurnRoute" AS ENUM ('initial', 'reroll', 'swap', 'refine', 'restart');

-- CreateEnum
CREATE TYPE "OutfitTurnStatus" AS ENUM ('pending', 'rejected', 'accepted', 'failed');

-- CreateTable
CREATE TABLE "OutfitSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalPrompt" TEXT NOT NULL,
    "date" TEXT,
    "weather" JSONB,
    "status" "OutfitSessionStatus" NOT NULL DEFAULT 'active',
    "acceptedTurnId" TEXT,
    "queuedOutfits" JSONB NOT NULL DEFAULT '[]',
    "bannedItemIds" TEXT[],
    "historySummary" TEXT,
    "summarizedThroughTurn" INTEGER NOT NULL DEFAULT 0,
    "memoryProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutfitSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutfitTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "userMessage" TEXT NOT NULL,
    "route" "OutfitTurnRoute" NOT NULL,
    "requirements" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "sentItemIds" TEXT[],
    "chosenItemIds" TEXT[],
    "name" TEXT,
    "reasons" TEXT[],
    "status" "OutfitTurnStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutfitTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutfitSession_acceptedTurnId_key" ON "OutfitSession"("acceptedTurnId");

-- CreateIndex
CREATE INDEX "OutfitSession_userId_updatedAt_idx" ON "OutfitSession"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutfitTurn_sessionId_turnNumber_key" ON "OutfitTurn"("sessionId", "turnNumber");

-- AddForeignKey
ALTER TABLE "OutfitSession" ADD CONSTRAINT "OutfitSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitSession" ADD CONSTRAINT "OutfitSession_acceptedTurnId_fkey" FOREIGN KEY ("acceptedTurnId") REFERENCES "OutfitTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitTurn" ADD CONSTRAINT "OutfitTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OutfitSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


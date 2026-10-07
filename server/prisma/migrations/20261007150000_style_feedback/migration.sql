-- CreateEnum
CREATE TYPE "StyleFeedbackKind" AS ENUM ('Accepted', 'Rejected');

-- CreateTable
CREATE TABLE "StyleFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "StyleFeedbackKind" NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "itemIds" TEXT[],
    "outfitId" TEXT,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StyleFeedback_userId_createdAt_idx" ON "StyleFeedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StyleFeedback" ADD CONSTRAINT "StyleFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
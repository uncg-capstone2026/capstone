-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('User', 'Learned');

-- CreateTable
CREATE TABLE "StyleNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "NoteSource" NOT NULL DEFAULT 'User',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StyleNote_userId_createdAt_idx" ON "StyleNote"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StyleNote" ADD CONSTRAINT "StyleNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
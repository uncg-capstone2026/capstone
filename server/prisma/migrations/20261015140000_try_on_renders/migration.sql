-- CreateTable
CREATE TABLE "TryOnRender" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tryOnPhotoId" TEXT NOT NULL,
    "itemIds" TEXT[],
    "itemsHash" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageKey" TEXT NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TryOnRender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TryOnRender_userId_itemsHash_idx" ON "TryOnRender"("userId", "itemsHash");

-- CreateIndex
CREATE UNIQUE INDEX "TryOnRender_tryOnPhotoId_itemsHash_position_key" ON "TryOnRender"("tryOnPhotoId", "itemsHash", "position");

-- AddForeignKey
ALTER TABLE "TryOnRender" ADD CONSTRAINT "TryOnRender_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnRender" ADD CONSTRAINT "TryOnRender_tryOnPhotoId_fkey" FOREIGN KEY ("tryOnPhotoId") REFERENCES "TryOnPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
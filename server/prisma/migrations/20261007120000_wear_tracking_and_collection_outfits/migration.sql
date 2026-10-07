-- Collections now hold outfits instead of items.
DROP TABLE "CollectionItem";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/New_York';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "timesWorn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "timesWornThisMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "wearPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "excludeFromSuggestions" BOOLEAN NOT NULL DEFAULT false;

-- Existing items: the 30-day wear period starts when the item was added.
UPDATE "Item" SET "wearPeriodStart" = "createdAt";

-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN "timesWorn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastWorn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CalendarEntry" ADD COLUMN "wornCountedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CollectionOutfit" (
    "collectionId" TEXT NOT NULL,
    "outfitId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionOutfit_pkey" PRIMARY KEY ("collectionId","outfitId")
);

-- AddForeignKey
ALTER TABLE "CollectionOutfit" ADD CONSTRAINT "CollectionOutfit_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionOutfit" ADD CONSTRAINT "CollectionOutfit_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Outfit pieces are removed with their outfit (was: blocked the delete).
ALTER TABLE "OutfitItem" DROP CONSTRAINT "OutfitItem_outfitId_fkey";
ALTER TABLE "OutfitItem" ADD CONSTRAINT "OutfitItem_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Outfit pieces now link to their item, and are removed with it.
ALTER TABLE "OutfitItem" ADD CONSTRAINT "OutfitItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Calendar entries are removed with their outfit (was: blocked the delete).
ALTER TABLE "CalendarEntry" DROP CONSTRAINT "CalendarEntry_outfitId_fkey";
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CollectionOutfit_outfitId_idx" ON "CollectionOutfit"("outfitId");

-- CreateIndex
CREATE INDEX "OutfitItem_itemId_idx" ON "OutfitItem"("itemId");

-- CreateIndex
CREATE INDEX "CalendarEntry_wornCountedAt_date_idx" ON "CalendarEntry"("wornCountedAt", "date");
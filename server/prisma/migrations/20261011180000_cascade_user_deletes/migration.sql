-- Deleting a user deletes everything they own. These four links blocked the
-- delete before (ON DELETE RESTRICT); the others already cascade.

-- DropForeignKey
ALTER TABLE "TryOnPhoto" DROP CONSTRAINT "TryOnPhoto_userId_fkey";
ALTER TABLE "Item" DROP CONSTRAINT "Item_userId_fkey";
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_userId_fkey";
ALTER TABLE "Outfit" DROP CONSTRAINT "Outfit_userId_fkey";

-- AddForeignKey
ALTER TABLE "TryOnPhoto" ADD CONSTRAINT "TryOnPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Outfit" ADD CONSTRAINT "Outfit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
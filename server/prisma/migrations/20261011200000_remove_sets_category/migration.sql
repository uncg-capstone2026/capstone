-- Remove the Sets category. Postgres can't drop a value from an enum, so this
-- builds a new enum without it and switches the column over.

BEGIN;

-- Items that were Sets become OnePiece first, or the switch below would fail.
UPDATE "Item" SET "category" = 'OnePiece' WHERE "category" = 'Sets';

-- AlterEnum
CREATE TYPE "Category_new" AS ENUM ('Top', 'Bottoms', 'Outerwear', 'Shoes', 'Accessory', 'OnePiece');
ALTER TABLE "Item" ALTER COLUMN "category" TYPE "Category_new" USING ("category"::text::"Category_new");
ALTER TYPE "Category" RENAME TO "Category_old";
ALTER TYPE "Category_new" RENAME TO "Category";
DROP TYPE "Category_old";

COMMIT;
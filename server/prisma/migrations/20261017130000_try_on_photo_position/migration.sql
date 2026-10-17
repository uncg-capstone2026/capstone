-- Keep only one try-on photo per user. The unique index below allows one photo
-- per (user, position), and every existing row becomes position 0, so any user
-- with more than one photo would make the index fail. The one kept is the
-- primary photo (the one the app shows), then the newest, then the highest id
-- so there's never a tie. Deleting a photo also deletes its TryOnRender rows
-- (ON DELETE CASCADE). Their files stay in S3.
DELETE FROM "TryOnPhoto" t
USING "TryOnPhoto" n
WHERE t."userId" = n."userId"
  AND (n."isPrimary", n."capturedAt", n."id") > (t."isPrimary", t."capturedAt", t."id");

-- AlterTable: existing rows become position 0 (the front photo) through the default.
ALTER TABLE "TryOnPhoto" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "TryOnPhoto_userId_position_key" ON "TryOnPhoto"("userId", "position");
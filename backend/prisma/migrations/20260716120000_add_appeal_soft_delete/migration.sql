-- Soft-delete support for Appeal: deleting now sets deletedAt instead of
-- removing the row, so it can be restored from the trash view.
ALTER TABLE "Appeal" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Appeal_deletedAt_idx" ON "Appeal"("deletedAt");

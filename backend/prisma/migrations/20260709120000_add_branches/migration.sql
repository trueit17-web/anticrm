-- New role for cross-branch oversight (branch creation, viewing all branches).
ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';

-- Branch table
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- Backfill: give every existing user/appeal/option a home branch so nothing
-- is orphaned once branchId becomes required below.
INSERT INTO "Branch" ("name") VALUES ('Главный офис');

-- User.branchId (nullable — SUPERADMIN accounts have no single branch)
ALTER TABLE "User" ADD COLUMN "branchId" INTEGER;
UPDATE "User" SET "branchId" = (SELECT "id" FROM "Branch" ORDER BY "id" LIMIT 1);
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- Appeal.branchId (required)
ALTER TABLE "Appeal" ADD COLUMN "branchId" INTEGER;
UPDATE "Appeal" SET "branchId" = (SELECT "id" FROM "Branch" ORDER BY "id" LIMIT 1);
ALTER TABLE "Appeal" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Appeal_branchId_idx" ON "Appeal"("branchId");

-- SelectOption.branchId (required) — dropdown lists are now per-branch, so
-- the old global uniqueness on (field, value) is replaced with per-branch.
ALTER TABLE "SelectOption" ADD COLUMN "branchId" INTEGER;
UPDATE "SelectOption" SET "branchId" = (SELECT "id" FROM "Branch" ORDER BY "id" LIMIT 1);
ALTER TABLE "SelectOption" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "SelectOption" ADD CONSTRAINT "SelectOption_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "SelectOption_field_value_key";
DROP INDEX "SelectOption_field_idx";
CREATE UNIQUE INDEX "SelectOption_branchId_field_value_key" ON "SelectOption"("branchId", "field", "value");
CREATE INDEX "SelectOption_branchId_field_idx" ON "SelectOption"("branchId", "field");

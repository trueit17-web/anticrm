-- AlterTable: additive, nullable column — safe on any existing data.
ALTER TABLE "Appeal" ADD COLUMN "reportedTime" TEXT;

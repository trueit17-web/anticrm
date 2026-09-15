-- AlterEnum
ALTER TYPE "OptionField" ADD VALUE 'SOURCE';

-- AlterTable
ALTER TABLE "Appeal" ADD COLUMN     "source" TEXT;

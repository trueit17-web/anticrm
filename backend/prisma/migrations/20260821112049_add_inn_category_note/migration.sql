-- AlterEnum
ALTER TYPE "OptionField" ADD VALUE 'INN_CATEGORY';

-- AlterTable
ALTER TABLE "InnEntry" ADD COLUMN     "category" TEXT,
ADD COLUMN     "note" TEXT;

/*
  Warnings:

  - You are about to drop the column `cbAssigneeId` on the `Appeal` table. All the data in the column will be lost.
  - You are about to drop the column `fsbAssigneeId` on the `Appeal` table. All the data in the column will be lost.
  - You are about to drop the column `govAssigneeId` on the `Appeal` table. All the data in the column will be lost.
  - The `intake` column on the `Appeal` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Appeal` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "OptionField" AS ENUM ('GOV', 'CB', 'FSB', 'STATUS', 'INTAKE');

-- DropForeignKey
ALTER TABLE "Appeal" DROP CONSTRAINT "Appeal_cbAssigneeId_fkey";

-- DropForeignKey
ALTER TABLE "Appeal" DROP CONSTRAINT "Appeal_fsbAssigneeId_fkey";

-- DropForeignKey
ALTER TABLE "Appeal" DROP CONSTRAINT "Appeal_govAssigneeId_fkey";

-- AlterTable
ALTER TABLE "Appeal" DROP COLUMN "cbAssigneeId",
DROP COLUMN "fsbAssigneeId",
DROP COLUMN "govAssigneeId",
ADD COLUMN     "cb" TEXT,
ADD COLUMN     "fsb" TEXT,
ADD COLUMN     "gov" TEXT,
DROP COLUMN "intake",
ADD COLUMN     "intake" TEXT NOT NULL DEFAULT 'Телефон',
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Новое';

-- DropEnum
DROP TYPE "AppealStatus";

-- DropEnum
DROP TYPE "IntakeChannel";

-- CreateTable
CREATE TABLE "SelectOption" (
    "id" SERIAL NOT NULL,
    "field" "OptionField" NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppealHistory" (
    "id" SERIAL NOT NULL,
    "appealId" INTEGER NOT NULL,
    "changedById" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppealHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SelectOption_field_idx" ON "SelectOption"("field");

-- CreateIndex
CREATE UNIQUE INDEX "SelectOption_field_value_key" ON "SelectOption"("field", "value");

-- CreateIndex
CREATE INDEX "AppealHistory_appealId_idx" ON "AppealHistory"("appealId");

-- CreateIndex
CREATE INDEX "Appeal_status_idx" ON "Appeal"("status");

-- CreateIndex
CREATE INDEX "Appeal_date_idx" ON "Appeal"("date");

-- AddForeignKey
ALTER TABLE "AppealHistory" ADD CONSTRAINT "AppealHistory_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealHistory" ADD CONSTRAINT "AppealHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

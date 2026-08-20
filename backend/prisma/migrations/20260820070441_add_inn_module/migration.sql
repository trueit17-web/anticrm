-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_branchId_fkey";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "innEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InnEntry" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "inn" TEXT NOT NULL,
    "companyName" TEXT,
    "region" TEXT,
    "contactsCount" INTEGER NOT NULL DEFAULT 0,
    "transferredCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InnEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InnEntry_branchId_date_idx" ON "InnEntry"("branchId", "date");

-- CreateIndex
CREATE INDEX "InnEntry_operatorId_date_idx" ON "InnEntry"("operatorId", "date");

-- CreateIndex
CREATE INDEX "InnEntry_branchId_inn_idx" ON "InnEntry"("branchId", "inn");

-- AddForeignKey
ALTER TABLE "InnEntry" ADD CONSTRAINT "InnEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InnEntry" ADD CONSTRAINT "InnEntry_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'REACHED', 'NOT_REACHED', 'DECLINED', 'CALLBACK');

-- CreateTable
CREATE TABLE "ContactBatch" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "batchId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "claimedById" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "resultNote" TEXT,
    "appealId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactBatch_branchId_idx" ON "ContactBatch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_appealId_key" ON "Contact"("appealId");

-- CreateIndex
CREATE INDEX "Contact_branchId_status_idx" ON "Contact"("branchId", "status");

-- CreateIndex
CREATE INDEX "Contact_batchId_idx" ON "Contact"("batchId");

-- CreateIndex
CREATE INDEX "Contact_claimedById_idx" ON "Contact"("claimedById");

-- AddForeignKey
ALTER TABLE "ContactBatch" ADD CONSTRAINT "ContactBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactBatch" ADD CONSTRAINT "ContactBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ContactBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "InnEntryHistory" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "changedById" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InnEntryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InnEntryHistory_entryId_idx" ON "InnEntryHistory"("entryId");

-- AddForeignKey
ALTER TABLE "InnEntryHistory" ADD CONSTRAINT "InnEntryHistory_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "InnEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InnEntryHistory" ADD CONSTRAINT "InnEntryHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

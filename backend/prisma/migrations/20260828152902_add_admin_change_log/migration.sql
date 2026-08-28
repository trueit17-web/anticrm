-- CreateTable
CREATE TABLE "AdminChangeLog" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "changedById" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminChangeLog_entityType_entityId_idx" ON "AdminChangeLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdminChangeLog_changedAt_idx" ON "AdminChangeLog"("changedAt");

-- AddForeignKey
ALTER TABLE "AdminChangeLog" ADD CONSTRAINT "AdminChangeLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

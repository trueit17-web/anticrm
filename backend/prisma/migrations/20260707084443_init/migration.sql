-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'ADVICE_GIVEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "IntakeChannel" AS ENUM ('PHONE', 'EMAIL', 'MESSENGER', 'IN_PERSON', 'WEBSITE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "intake" "IntakeChannel" NOT NULL DEFAULT 'PHONE',
    "clientData" TEXT,
    "govAssigneeId" INTEGER,
    "cbAssigneeId" INTEGER,
    "fsbAssigneeId" INTEGER,
    "closerAssigneeId" INTEGER,
    "status" "AppealStatus" NOT NULL DEFAULT 'NEW',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Appeal_operatorId_idx" ON "Appeal"("operatorId");

-- CreateIndex
CREATE INDEX "Appeal_status_idx" ON "Appeal"("status");

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_govAssigneeId_fkey" FOREIGN KEY ("govAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_cbAssigneeId_fkey" FOREIGN KEY ("cbAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_fsbAssigneeId_fkey" FOREIGN KEY ("fsbAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_closerAssigneeId_fkey" FOREIGN KEY ("closerAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

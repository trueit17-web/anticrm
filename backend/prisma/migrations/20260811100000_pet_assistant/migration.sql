-- "Питомец" module: per-branch toggle + mascot profile + learnable tip rules.
ALTER TABLE "Branch" ADD COLUMN "petEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PetProfile" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Кеша',
    "skin" TEXT NOT NULL DEFAULT 'fox',
    "chattiness" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PetProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PetProfile_branchId_key" ON "PetProfile"("branchId");
CREATE INDEX "PetProfile_branchId_idx" ON "PetProfile"("branchId");

ALTER TABLE "PetProfile" ADD CONSTRAINT "PetProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PetRule" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PetRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PetRule_branchId_idx" ON "PetRule"("branchId");

ALTER TABLE "PetRule" ADD CONSTRAINT "PetRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

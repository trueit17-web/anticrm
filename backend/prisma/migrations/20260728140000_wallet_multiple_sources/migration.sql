-- "Считать кош": support several source wallets per branch. Move the single
-- Branch.walletAddress into a new WalletSource table, then drop the column.
CREATE TABLE "WalletSource" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletSource_branchId_idx" ON "WalletSource"("branchId");
CREATE UNIQUE INDEX "WalletSource_branchId_address_key" ON "WalletSource"("branchId", "address");

ALTER TABLE "WalletSource" ADD CONSTRAINT "WalletSource_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry over any existing single source wallet.
INSERT INTO "WalletSource" ("branchId", "address")
SELECT "id", trim("walletAddress") FROM "Branch"
WHERE "walletAddress" IS NOT NULL AND trim("walletAddress") <> '';

ALTER TABLE "Branch" DROP COLUMN "walletAddress";

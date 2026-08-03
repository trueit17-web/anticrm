-- "Считать кош" module: per-branch toggle + source wallet, and a
-- destination-address → recipient-name mapping table. Additive, no risk to
-- existing data.
ALTER TABLE "Branch" ADD COLUMN "walletCountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Branch" ADD COLUMN "walletAddress" TEXT;

CREATE TABLE "WalletRecipient" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletRecipient_branchId_idx" ON "WalletRecipient"("branchId");
CREATE UNIQUE INDEX "WalletRecipient_branchId_address_key" ON "WalletRecipient"("branchId", "address");

ALTER TABLE "WalletRecipient" ADD CONSTRAINT "WalletRecipient_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

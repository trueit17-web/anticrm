-- "Считать кош": per-branch Tronscan API key, "hub" flag on recipients, and a
-- one-hop cache for hub tracing. All additive.
ALTER TABLE "Branch" ADD COLUMN "tronscanApiKey" TEXT;

ALTER TABLE "WalletRecipient" ADD COLUMN "isHub" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WalletHopCache" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "nextHops" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletHopCache_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletHopCache_branchId_idx" ON "WalletHopCache"("branchId");
CREATE UNIQUE INDEX "WalletHopCache_branchId_address_key" ON "WalletHopCache"("branchId", "address");

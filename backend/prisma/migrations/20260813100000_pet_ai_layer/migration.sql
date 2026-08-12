-- Stage 5: optional AI layer for the pet — asks an LLM (via OpenRouter) for
-- a couple of fresh tips based on aggregate shift stats. Off by default.
ALTER TABLE "PetProfile" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PetProfile" ADD COLUMN "openRouterApiKey" TEXT;

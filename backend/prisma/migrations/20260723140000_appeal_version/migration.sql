-- HI-10: optimistic-lock counter for Appeal, defaulting existing rows to 0.
ALTER TABLE "Appeal" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

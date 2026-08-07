-- Hide selected users (e.g. test/inactive accounts) from the operator
-- ranking on the Statistics page.
ALTER TABLE "User" ADD COLUMN "excludedFromStats" BOOLEAN NOT NULL DEFAULT false;

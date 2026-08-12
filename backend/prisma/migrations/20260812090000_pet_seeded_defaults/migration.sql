-- The two built-in pet rules become editable/deletable PetRule rows. This flag
-- tracks whether they've been materialized for a branch, so we seed them once
-- and never resurrect ones the admin deleted. Existing pet profiles start at
-- false and get seeded on their next config load.
ALTER TABLE "PetProfile" ADD COLUMN "seededDefaults" BOOLEAN NOT NULL DEFAULT false;

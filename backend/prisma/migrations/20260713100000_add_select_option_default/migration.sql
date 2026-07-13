-- Only meaningful for field=STATUS: the status a new trubka gets when none
-- is set explicitly. At most one true per branch+field, enforced in the
-- service layer.
ALTER TABLE "SelectOption" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

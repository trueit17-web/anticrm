-- Pet rules can now target a specific branch status (customizable per branch),
-- stored in `param` for trigger = 'status'.
ALTER TABLE "PetRule" ADD COLUMN "param" TEXT;

-- AlterEnum: OptionField swaps INTAKE for CLOSER (Прием became a plain
-- boolean checkbox, Закрыв became an admin-curated tag like Госы/ЦБ/ФСБ).
ALTER TYPE "OptionField" RENAME TO "OptionField_old";
CREATE TYPE "OptionField" AS ENUM ('GOV', 'CB', 'FSB', 'CLOSER', 'STATUS');
ALTER TABLE "SelectOption" ALTER COLUMN "field" TYPE "OptionField" USING ("field"::text::"OptionField");
DROP TYPE "OptionField_old";

-- DropForeignKey
ALTER TABLE "Appeal" DROP CONSTRAINT "Appeal_closerAssigneeId_fkey";

-- AlterTable
ALTER TABLE "Appeal"
  DROP COLUMN "closerAssigneeId",
  ADD COLUMN "closer" TEXT,
  DROP COLUMN "intake",
  ADD COLUMN "intake" BOOLEAN NOT NULL DEFAULT false;

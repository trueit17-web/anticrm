-- New admin-configurable tag column "ТФ", shown right after Телефон.
ALTER TYPE "OptionField" ADD VALUE 'TF';
ALTER TABLE "Appeal" ADD COLUMN "tf" TEXT;

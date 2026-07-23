-- Прозвон: three new call dispositions logged from the call card, tracked
-- separately in the Прозвон statistics (АО / Недожал / Скип на коде).
-- ADD VALUE is safe inside the migration transaction on PG12+ as long as the
-- new values aren't used in the same transaction (they aren't). IF NOT EXISTS
-- keeps the migration idempotent if partially applied.
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'ANSWERING_MACHINE';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'NOT_PUSHED';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'SKIP_ON_CODE';

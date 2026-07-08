-- AlterTable
ALTER TABLE "Appeal" ADD COLUMN     "smsSentAt" TIMESTAMP(3),
ADD COLUMN     "smsSentById" INTEGER;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_smsSentById_fkey" FOREIGN KEY ("smsSentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

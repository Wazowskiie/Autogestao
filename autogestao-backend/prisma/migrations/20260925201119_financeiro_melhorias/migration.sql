-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "recurrenceId" TEXT,
ADD COLUMN     "recurrenceIndex" INTEGER,
ADD COLUMN     "recurrenceTotal" INTEGER,
ADD COLUMN     "vehicleId" TEXT;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

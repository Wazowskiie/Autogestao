-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "budget" DECIMAL(12,2),
ADD COLUMN     "next_action_date" TIMESTAMP(3),
ADD COLUMN     "next_action_note" TEXT,
ADD COLUMN     "payment_intent" TEXT,
ADD COLUMN     "temperature" TEXT;

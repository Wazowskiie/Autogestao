-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "contract_number" TEXT;

-- CreateTable
CREATE TABLE "interest_rates" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "min_installments" INTEGER NOT NULL,
    "max_installments" INTEGER NOT NULL,
    "rate" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "interest_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interest_rates_dealership_id_idx" ON "interest_rates"("dealership_id");

-- AddForeignKey
ALTER TABLE "interest_rates" ADD CONSTRAINT "interest_rates_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

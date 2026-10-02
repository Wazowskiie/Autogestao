-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "trade_in_value" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "trade_in_sale_id" TEXT;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_trade_in_sale_id_fkey" FOREIGN KEY ("trade_in_sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

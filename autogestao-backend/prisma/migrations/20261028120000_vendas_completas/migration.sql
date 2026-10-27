-- Vendas: cancelamento (distrato), comissão, garantia e pós-venda
ALTER TABLE "sales" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "sales" ADD COLUMN "canceled_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "cancel_reason" TEXT;
ALTER TABLE "sales" ADD COLUMN "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "commission_rate" DECIMAL(5,2);
ALTER TABLE "sales" ADD COLUMN "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "commission_paid_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "commission_transaction_id" TEXT;
ALTER TABLE "sales" ADD COLUMN "warranty_days" INTEGER;
ALTER TABLE "sales" ADD COLUMN "warranty_coverage" TEXT;
ALTER TABLE "sales" ADD COLUMN "delivery_checklist" JSONB;

-- Um veículo pode ter uma venda cancelada e depois ser vendido de novo
DROP INDEX "sales_vehicle_id_key";
CREATE INDEX "sales_vehicle_id_idx" ON "sales"("vehicle_id");
CREATE INDEX "sales_dealership_id_status_idx" ON "sales"("dealership_id", "status");

-- Financiamento: banco, situação da ficha, depósito e retorno
ALTER TABLE "sale_payments" ADD COLUMN "bank" TEXT;
ALTER TABLE "sale_payments" ADD COLUMN "financing_status" TEXT;
ALTER TABLE "sale_payments" ADD COLUMN "received_at" TIMESTAMP(3);
ALTER TABLE "sale_payments" ADD COLUMN "return_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "sale_payments" ADD COLUMN "financial_transaction_id" TEXT;
ALTER TABLE "sale_payments" ADD COLUMN "return_transaction_id" TEXT;

-- Despesas da venda (transferência, vistoria, brinde...)
CREATE TABLE "sale_expenses" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "financial_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_expenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sale_expenses_sale_id_idx" ON "sale_expenses"("sale_id");
ALTER TABLE "sale_expenses" ADD CONSTRAINT "sale_expenses_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reserva com sinal
CREATE TABLE "vehicle_reservations" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "seller_id" TEXT,
    "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_method" TEXT,
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "financial_transaction_id" TEXT,
    "sale_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "vehicle_reservations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehicle_reservations_dealership_id_status_idx" ON "vehicle_reservations"("dealership_id", "status");
CREATE INDEX "vehicle_reservations_vehicle_id_idx" ON "vehicle_reservations"("vehicle_id");
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

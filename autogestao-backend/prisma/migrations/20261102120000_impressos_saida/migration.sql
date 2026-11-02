-- Impressos de saída: RG do cliente, hora da venda, dados da transferência e parcelas do cartão

ALTER TABLE "customers" ADD COLUMN "rg" TEXT;

-- Vendas antigas ficam sem hora (NULL); as novas recebem a hora do registro
ALTER TABLE "sales" ADD COLUMN "created_at" TIMESTAMP(3);
ALTER TABLE "sales" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sales" ADD COLUMN "transfer_info" TEXT;

ALTER TABLE "sale_payments" ADD COLUMN "installment_amount" DECIMAL(12,2);
ALTER TABLE "sale_payments" ADD COLUMN "payment_date" TIMESTAMP(3);

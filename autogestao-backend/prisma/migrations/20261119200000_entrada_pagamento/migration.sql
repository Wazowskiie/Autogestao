-- Como a loja pagou o fornecedor (sai no contrato de compra)
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "payment_method" TEXT;
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "payment_details" TEXT;

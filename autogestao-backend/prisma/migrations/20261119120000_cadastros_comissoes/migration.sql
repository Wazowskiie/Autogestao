-- Vendedor: CPF e comissão por forma de pagamento
-- commission_rate continua sendo a comissão da venda à vista; as outras duas,
-- quando vazias, usam a mesma da venda à vista (nada muda para quem já está cadastrado)
ALTER TABLE "users" ADD COLUMN "cpf" TEXT;
ALTER TABLE "users" ADD COLUMN "commission_rate_promissory" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "commission_rate_financing" DOUBLE PRECISION;

-- Cliente: contato de recado
ALTER TABLE "customers" ADD COLUMN "alt_contact_name" TEXT;
ALTER TABLE "customers" ADD COLUMN "alt_phone" TEXT;

-- Fornecedor (entrada do veículo): endereço e contato de recado
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "supplier_address" TEXT;
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "supplier_alt_contact_name" TEXT;
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "supplier_alt_phone" TEXT;

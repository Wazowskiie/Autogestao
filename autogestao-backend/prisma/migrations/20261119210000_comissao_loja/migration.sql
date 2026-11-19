-- Comissão dos vendedores definida pela loja (vale para todos): à vista, financiada e promissória por faixa de entrada
ALTER TABLE "dealerships" ADD COLUMN "commission_rules" JSONB;

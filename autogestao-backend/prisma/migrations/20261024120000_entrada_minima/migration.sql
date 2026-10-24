-- Entrada mínima exigida nas vendas com promissória (% do valor do veículo). Vazio = sem mínimo.
ALTER TABLE "dealerships" ADD COLUMN "min_down_payment_percent" DECIMAL(5,2);

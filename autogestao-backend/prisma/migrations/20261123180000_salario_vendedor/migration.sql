-- Salário fixo do vendedor (usado no Fechamento: total a receber = fixo + comissão)
ALTER TABLE "users" ADD COLUMN "salary" DECIMAL(12,2);

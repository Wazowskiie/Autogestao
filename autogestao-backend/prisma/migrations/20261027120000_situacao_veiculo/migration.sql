-- Situação do veículo no cadastro: licenciamento, multas, Renajud, recall e devolução
ALTER TABLE "vehicles" ADD COLUMN "doc_status" JSONB;

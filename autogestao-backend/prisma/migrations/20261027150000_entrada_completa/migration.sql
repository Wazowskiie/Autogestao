-- Entrada do veículo: intermediário, canal da entrada e lista de débitos (data, descrição, valor)
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "intermediary" TEXT;
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "entry_channel" TEXT;
ALTER TABLE "vehicle_acquisitions" ADD COLUMN "debts" JSONB;

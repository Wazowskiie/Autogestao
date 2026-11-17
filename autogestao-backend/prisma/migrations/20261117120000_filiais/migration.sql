-- Filiais da revenda e o vínculo do veículo com a filial
CREATE TABLE "store_units" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_units_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "store_units_dealership_id_name_key" ON "store_units"("dealership_id", "name");
ALTER TABLE "store_units" ADD CONSTRAINT "store_units_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD COLUMN "unit_id" TEXT;
CREATE INDEX "vehicles_unit_id_idx" ON "vehicles"("unit_id");
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "store_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fechada para a API pública do Supabase, como as demais tabelas (o backend é dono e ignora o RLS)
ALTER TABLE "store_units" ENABLE ROW LEVEL SECURITY;

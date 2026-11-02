-- Assinatura eletrônica dos impressos de saída (Autentique)
ALTER TABLE "dealerships" ADD COLUMN "esign_folder_id" TEXT;

CREATE TABLE "sale_signatures" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "print_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'autentique',
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "signers" JSONB NOT NULL,
    "last_error" TEXT,
    "created_by_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sale_signatures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_signatures_external_id_key" ON "sale_signatures"("external_id");
CREATE INDEX "sale_signatures_dealership_id_sale_id_idx" ON "sale_signatures"("dealership_id", "sale_id");
CREATE INDEX "sale_signatures_dealership_id_created_at_idx" ON "sale_signatures"("dealership_id", "created_at");
ALTER TABLE "sale_signatures" ADD CONSTRAINT "sale_signatures_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_signatures" ADD CONSTRAINT "sale_signatures_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

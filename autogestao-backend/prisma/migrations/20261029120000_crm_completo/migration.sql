-- CRM: troca no lead, primeiro contato, configurações, mensagens prontas,
-- lista de desejos e pós-venda
ALTER TABLE "leads" ADD COLUMN "trade_in" JSONB;
ALTER TABLE "leads" ADD COLUMN "first_contact_at" TIMESTAMP(3);
ALTER TABLE "dealerships" ADD COLUMN "crm_settings" JSONB;

CREATE TABLE "crm_message_templates" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'geral',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_message_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crm_message_templates_dealership_id_idx" ON "crm_message_templates"("dealership_id");
ALTER TABLE "crm_message_templates" ADD CONSTRAINT "crm_message_templates_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "crm_wishes" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "year_min" INTEGER,
    "year_max" INTEGER,
    "price_max" DECIMAL(12,2),
    "km_max" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "crm_wishes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crm_wishes_dealership_id_status_idx" ON "crm_wishes"("dealership_id", "status");
CREATE INDEX "crm_wishes_lead_id_idx" ON "crm_wishes"("lead_id");
ALTER TABLE "crm_wishes" ADD CONSTRAINT "crm_wishes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "crm_wish_matches" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "wish_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_wish_matches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_wish_matches_wish_id_vehicle_id_key" ON "crm_wish_matches"("wish_id", "vehicle_id");
CREATE INDEX "crm_wish_matches_dealership_id_idx" ON "crm_wish_matches"("dealership_id");
ALTER TABLE "crm_wish_matches" ADD CONSTRAINT "crm_wish_matches_wish_id_fkey" FOREIGN KEY ("wish_id") REFERENCES "crm_wishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_wish_matches" ADD CONSTRAINT "crm_wish_matches_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "crm_followups" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "seller_id" TEXT,
    "sale_id" TEXT,
    "lead_id" TEXT,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vehicle_label" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),
    CONSTRAINT "crm_followups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_followups_dealership_id_key_key" ON "crm_followups"("dealership_id", "key");
CREATE INDEX "crm_followups_dealership_id_status_due_date_idx" ON "crm_followups"("dealership_id", "status", "due_date");
ALTER TABLE "crm_followups" ADD CONSTRAINT "crm_followups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

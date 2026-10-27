-- WhatsApp e redes sociais da loja
ALTER TABLE "dealerships" ADD COLUMN "social_links" JSONB;

-- Conexão com a API oficial do WhatsApp (Meta)
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "waba_id" TEXT,
    "display_phone" TEXT,
    "verified_name" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "app_secret_enc" TEXT NOT NULL,
    "verify_token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "last_error" TEXT,
    "last_webhook_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_accounts_dealership_id_key" ON "whatsapp_accounts"("dealership_id");
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_key" ON "whatsapp_accounts"("phone_number_id");
CREATE UNIQUE INDEX "whatsapp_accounts_verify_token_key" ON "whatsapp_accounts"("verify_token");
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mensagens trocadas pelo WhatsApp
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "wa_message_id" TEXT,
    "wa_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "sent_by_id" TEXT,
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_messages_wa_message_id_key" ON "whatsapp_messages"("wa_message_id");
CREATE INDEX "whatsapp_messages_dealership_id_customer_id_sent_at_idx" ON "whatsapp_messages"("dealership_id", "customer_id", "sent_at");
CREATE INDEX "whatsapp_messages_lead_id_idx" ON "whatsapp_messages"("lead_id");
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

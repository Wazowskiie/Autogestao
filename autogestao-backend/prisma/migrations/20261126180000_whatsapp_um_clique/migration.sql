-- WhatsApp com um clique (cadastro incorporado da Meta): a chave secreta vem do app ChronosAuto (.env)
ALTER TABLE "whatsapp_accounts" ALTER COLUMN "app_secret_enc" DROP NOT NULL;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "connect_mode" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_id" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "pin_enc" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "token_expires_at" TIMESTAMP(3);

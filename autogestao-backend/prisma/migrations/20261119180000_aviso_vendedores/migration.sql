-- Modelo do WhatsApp (aprovado na Meta) usado para avisar os vendedores de cliente esperando no chat
ALTER TABLE "whatsapp_accounts" ADD COLUMN "seller_alert_template" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "seller_alert_lang" TEXT NOT NULL DEFAULT 'pt_BR';

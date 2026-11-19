-- Nome de quem respondeu no chat (vendedor), guardado no momento do envio
ALTER TABLE "chat_messages" ADD COLUMN "author_name" TEXT;

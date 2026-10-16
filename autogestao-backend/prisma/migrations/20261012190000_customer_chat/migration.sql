CREATE TABLE "chat_conversations" (
 "id" TEXT PRIMARY KEY, "dealership_id" TEXT NOT NULL,
 "token_hash" TEXT NOT NULL UNIQUE, "mode" TEXT NOT NULL DEFAULT 'bot',
 "customer_id" TEXT, "lead_id" TEXT, "assigned_user_id" TEXT,
 "generation_id" TEXT, "busy_until" TIMESTAMP(3), "expires_at" TIMESTAMP(3) NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "chat_conversations_dealership_id_updated_at_idx" ON "chat_conversations"("dealership_id", "updated_at");
CREATE TABLE "chat_messages" (
 "id" TEXT PRIMARY KEY, "conversation_id" TEXT NOT NULL, "role" TEXT NOT NULL,
 "content" TEXT NOT NULL, "client_message_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "chat_messages_conversation_id_client_message_id_key" ON "chat_messages"("conversation_id", "client_message_id");
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

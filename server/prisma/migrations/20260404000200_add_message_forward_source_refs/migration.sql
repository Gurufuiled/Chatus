ALTER TABLE "messages"
ADD COLUMN "forwarded_from_chat_id" TEXT,
ADD COLUMN "forwarded_from_sender_id" TEXT;

CREATE INDEX "messages_forwarded_from_chat_id_idx"
ON "messages"("forwarded_from_chat_id");

CREATE INDEX "messages_forwarded_from_sender_id_idx"
ON "messages"("forwarded_from_sender_id");

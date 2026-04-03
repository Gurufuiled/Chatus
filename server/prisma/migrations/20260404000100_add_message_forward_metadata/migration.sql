ALTER TABLE "messages"
ADD COLUMN "forwarded_from_message_id" TEXT,
ADD COLUMN "forwarded_from_name" TEXT;

CREATE INDEX "messages_forwarded_from_message_id_idx"
ON "messages"("forwarded_from_message_id");

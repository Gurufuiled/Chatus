-- AlterTable
ALTER TABLE "messages" ADD COLUMN "mailbox_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_mailbox_expires_at_idx" ON "messages"("mailbox_expires_at");

-- CreateTable
CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);

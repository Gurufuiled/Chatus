-- DropIndex
DROP INDEX "chats_pinned_message_id_idx";

-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "description" TEXT;

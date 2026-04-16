-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "comment_cooldown_sec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "disable_comments_all" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disable_comments_new" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disable_media_comments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disable_voice_comments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chats_slug_key" ON "chats"("slug");

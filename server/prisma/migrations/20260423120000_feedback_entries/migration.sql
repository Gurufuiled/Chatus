-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('bug', 'suggestion');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "feedback_entries" (
    "id" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_entries_author_id_idx" ON "feedback_entries"("author_id");

-- CreateIndex
CREATE INDEX "feedback_entries_type_created_at_idx" ON "feedback_entries"("type", "created_at");

-- AddForeignKey
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

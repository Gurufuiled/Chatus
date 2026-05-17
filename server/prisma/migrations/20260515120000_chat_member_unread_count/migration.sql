-- Per-user unread counter for chat list / tab badges after cold start.
ALTER TABLE "chat_members" ADD COLUMN "unread_count" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  CREATE TYPE "ChatVisibility" AS ENUM ('public', 'private');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ChatAccessType" AS ENUM ('free', 'paid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('none', 'pending', 'active', 'expired', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ChatType" ADD VALUE IF NOT EXISTS 'channel';
ALTER TYPE "ChatType" ADD VALUE IF NOT EXISTS 'discussion';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "handle" TEXT;

ALTER TABLE "chats"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "visibility" "ChatVisibility" NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "access_type" "ChatAccessType" NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "subscription_price_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "subscription_period_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "linked_discussion_chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "invite_token" TEXT,
  ADD COLUMN IF NOT EXISTS "allow_comments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allow_reactions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "preview_post_count" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "subscriber_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "active_subscriber_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pending_earnings_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "available_payout_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paid_out_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pinned_message_id" TEXT;

ALTER TABLE "chat_members"
  ADD COLUMN IF NOT EXISTS "access_status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "subscription_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tag" TEXT,
  ADD COLUMN IF NOT EXISTS "tag_color" TEXT;

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "thread_root_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "forwarded_from_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "forwarded_from_name" TEXT,
  ADD COLUMN IF NOT EXISTS "forwarded_from_chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "forwarded_from_sender_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_channel_post" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "view_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "comment_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "thumbnail_url" TEXT;

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_handle_key" ON "users"("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "chats_invite_token_key" ON "chats"("invite_token");
CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_message_id_user_id_key" ON "message_reactions"("message_id", "user_id");

CREATE INDEX IF NOT EXISTS "messages_thread_root_message_id_idx" ON "messages"("thread_root_message_id");
CREATE INDEX IF NOT EXISTS "messages_forwarded_from_message_id_idx" ON "messages"("forwarded_from_message_id");
CREATE INDEX IF NOT EXISTS "messages_forwarded_from_chat_id_idx" ON "messages"("forwarded_from_chat_id");
CREATE INDEX IF NOT EXISTS "messages_forwarded_from_sender_id_idx" ON "messages"("forwarded_from_sender_id");
CREATE INDEX IF NOT EXISTS "message_reactions_message_id_idx" ON "message_reactions"("message_id");
CREATE INDEX IF NOT EXISTS "message_reactions_user_id_idx" ON "message_reactions"("user_id");

DO $$
BEGIN
  ALTER TABLE "chats"
    ADD CONSTRAINT "chats_pinned_message_id_fkey"
    FOREIGN KEY ("pinned_message_id")
    REFERENCES "messages"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey"
    FOREIGN KEY ("message_id")
    REFERENCES "messages"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

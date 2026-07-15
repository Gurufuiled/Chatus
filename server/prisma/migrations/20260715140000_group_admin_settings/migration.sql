-- Group admin settings, permissions, pin notify, polls

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'poll';

ALTER TABLE "chats"
  ADD COLUMN IF NOT EXISTS "hide_members" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "restrict_saving_content" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "member_permissions" JSONB,
  ADD COLUMN IF NOT EXISTS "pinned_notify" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "chat_members"
  ADD COLUMN IF NOT EXISTS "admin_permissions" JSONB;

CREATE TABLE IF NOT EXISTS "polls" (
  "id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
  "allows_multiple" BOOLEAN NOT NULL DEFAULT false,
  "is_closed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "polls_message_id_key" ON "polls"("message_id");

CREATE TABLE IF NOT EXISTS "poll_options" (
  "id" TEXT NOT NULL,
  "poll_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "poll_options_poll_id_index_key" ON "poll_options"("poll_id", "index");
CREATE INDEX IF NOT EXISTS "poll_options_poll_id_idx" ON "poll_options"("poll_id");

CREATE TABLE IF NOT EXISTS "poll_votes" (
  "id" TEXT NOT NULL,
  "poll_id" TEXT NOT NULL,
  "option_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "poll_votes_poll_id_user_id_option_id_key" ON "poll_votes"("poll_id", "user_id", "option_id");
CREATE INDEX IF NOT EXISTS "poll_votes_poll_id_idx" ON "poll_votes"("poll_id");
CREATE INDEX IF NOT EXISTS "poll_votes_option_id_idx" ON "poll_votes"("option_id");
CREATE INDEX IF NOT EXISTS "poll_votes_user_id_idx" ON "poll_votes"("user_id");

DO $$ BEGIN
  ALTER TABLE "polls" ADD CONSTRAINT "polls_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey"
    FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey"
    FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey"
    FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

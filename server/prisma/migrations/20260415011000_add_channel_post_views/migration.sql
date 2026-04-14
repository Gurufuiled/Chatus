CREATE TABLE IF NOT EXISTS "channel_post_views" (
  "message_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "channel_post_views_pkey" PRIMARY KEY ("message_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "channel_post_views_user_id_idx" ON "channel_post_views"("user_id");

DO $$
BEGIN
  ALTER TABLE "channel_post_views"
    ADD CONSTRAINT "channel_post_views_message_id_fkey"
    FOREIGN KEY ("message_id")
    REFERENCES "messages"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "channel_post_views"
    ADD CONSTRAINT "channel_post_views_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

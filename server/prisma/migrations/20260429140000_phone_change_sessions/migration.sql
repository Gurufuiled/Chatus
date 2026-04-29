-- CreateTable
CREATE TABLE "phone_change_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "new_phone" VARCHAR(32) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_change_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "phone_change_sessions_user_id_idx" ON "phone_change_sessions"("user_id");

ALTER TABLE "phone_change_sessions" ADD CONSTRAINT "phone_change_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

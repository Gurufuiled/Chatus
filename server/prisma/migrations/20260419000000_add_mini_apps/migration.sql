-- CreateTable
CREATE TABLE "developer_profiles" (
    "user_id" TEXT NOT NULL,
    "agreement_accepted_at" TIMESTAMP(3) NOT NULL,
    "agreement_version" TEXT NOT NULL DEFAULT '1.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mini_apps" (
    "id" TEXT NOT NULL,
    "short_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "base_url" TEXT NOT NULL,
    "allowed_hosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mini_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mini_apps_short_id_key" ON "mini_apps"("short_id");

-- CreateIndex
CREATE INDEX "mini_apps_owner_id_idx" ON "mini_apps"("owner_id");

-- CreateIndex
CREATE INDEX "mini_apps_is_published_idx" ON "mini_apps"("is_published");

-- AddForeignKey
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_apps" ADD CONSTRAINT "mini_apps_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "developer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reserve @ChatusFather system user
INSERT INTO "users" ("id", "handle", "username", "display_name", "avatar_url", "is_online", "created_at", "updated_at")
VALUES (
    '00000000-0000-0000-0000-00000000cfaf',
    'ChatusFather',
    'ChatusFather',
    'Chatus Father',
    NULL,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;

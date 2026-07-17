-- CreateTable
CREATE TABLE "peer_contact_customizations" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "peer_user_id" TEXT NOT NULL,
    "first_name" VARCHAR(120),
    "last_name" VARCHAR(120),
    "note" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "peer_contact_customizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "peer_contact_customizations_owner_user_id_idx" ON "peer_contact_customizations"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "peer_contact_customizations_owner_user_id_peer_user_id_key" ON "peer_contact_customizations"("owner_user_id", "peer_user_id");

-- AddForeignKey
ALTER TABLE "peer_contact_customizations" ADD CONSTRAINT "peer_contact_customizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_contact_customizations" ADD CONSTRAINT "peer_contact_customizations_peer_user_id_fkey" FOREIGN KEY ("peer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

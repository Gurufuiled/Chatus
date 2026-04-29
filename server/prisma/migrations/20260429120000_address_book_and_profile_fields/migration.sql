-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_name" TEXT;
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
ALTER TABLE "users" ADD COLUMN "birthday" DATE;

-- CreateTable
CREATE TABLE "address_book_contacts" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "linked_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_book_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "address_book_contacts_owner_user_id_phone_key" ON "address_book_contacts"("owner_user_id", "phone");
CREATE INDEX "address_book_contacts_owner_user_id_idx" ON "address_book_contacts"("owner_user_id");

ALTER TABLE "address_book_contacts" ADD CONSTRAINT "address_book_contacts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "address_book_contacts" ADD CONSTRAINT "address_book_contacts_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

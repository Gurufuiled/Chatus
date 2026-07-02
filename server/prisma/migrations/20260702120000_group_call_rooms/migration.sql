-- CreateTable
CREATE TABLE "group_call_rooms" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "livekit_room_name" TEXT NOT NULL,
    "started_by_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "group_call_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_call_rooms_livekit_room_name_key" ON "group_call_rooms"("livekit_room_name");

-- CreateIndex
CREATE INDEX "group_call_rooms_chat_id_ended_at_idx" ON "group_call_rooms"("chat_id", "ended_at");

-- AddForeignKey
ALTER TABLE "group_call_rooms" ADD CONSTRAINT "group_call_rooms_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_call_rooms" ADD CONSTRAINT "group_call_rooms_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

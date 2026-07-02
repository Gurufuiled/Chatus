-- One active group call per chat (ended_at IS NULL).
CREATE UNIQUE INDEX "group_call_rooms_one_active_per_chat"
ON "group_call_rooms" ("chat_id")
WHERE "ended_at" IS NULL;

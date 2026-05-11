-- CreateTable
CREATE TABLE "line_sync_cache_events" (
    "event_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    CONSTRAINT "line_sync_cache_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "line_sync_cache_events_line_id_idx" ON "line_sync_cache_events"("line_id");

-- CreateIndex
CREATE INDEX "line_sync_cache_events_expires_at_idx" ON "line_sync_cache_events"("expires_at");

-- CreateIndex
CREATE INDEX "line_sync_cache_events_line_id_created_at_idx" ON "line_sync_cache_events"("line_id", "created_at");

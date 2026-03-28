# Step 2. Rust in Server Media Pipeline

## Status

Completed.

## Goal

Move heavy media inspection and preparation out of NestJS into Rust without breaking the existing mobile API contract.

## Why This Step Was Chosen First

Media is already a real part of the product:

- `image`
- `voice`
- `file`
- `video_note`

This made server-side media handling the safest first place to introduce Rust:

- no need to touch React Native UI directly
- no need to build a mobile native bridge yet
- easy to keep a fallback path in NestJS
- immediate practical value for uploads and metadata

## What Was Implemented

### Rust workspace and worker

Added a dedicated Rust workspace and media worker:

- `rust/Cargo.toml`
- `rust/bin/media-worker/Cargo.toml`
- `rust/bin/media-worker/src/main.rs`

The worker is called by NestJS after the uploaded file is saved.

### Server-side integration

Integrated the worker into the server upload flow:

- `server/src/upload/rust-media-worker.service.ts`
- `server/src/upload/upload.service.ts`
- `server/src/upload/upload.controller.ts`
- `server/src/upload/upload.module.ts`

The server now:

1. receives the file
2. saves it to `uploads`
3. optionally calls Rust worker
4. receives normalized media metadata
5. returns the same mobile-friendly upload response shape

### Safety and rollout controls

Added a safe optional path instead of a hard switch:

- feature flag via `RUST_MEDIA_WORKER_ENABLED`
- configurable timeout
- binary path resolution for debug/release builds
- clean fallback to plain NestJS metadata if Rust is unavailable

Related files:

- `server/.env.example`
- `server/package.json`
- `rust/docs/media-worker-integration.md`

## What the Rust Worker Does Now

### Metadata extraction

The worker now extracts useful metadata for:

- `PNG`
- `JPEG`
- `GIF`
- `BMP`
- `WEBP`
- `WAV`
- `MP4`
- `M4A`
- `MOV`

It returns fields such as:

- `kind`
- `mime_type`
- `file_name`
- `file_size`
- `width`
- `height`
- `duration_ms`
- `thumbnail_path`
- `waveform`

### Smarter media-kind detection

The worker does not rely only on client MIME.

It now also:

- detects format by file signature where possible
- distinguishes audio-only `mp4/m4a` from real video tracks
- classifies `voice` / `video` / `video_note` more reliably

### Waveform generation

For `WAV`, the worker now builds a real server-side waveform.

This is already connected through the current server/mobile path.

### Thumbnail generation

For image uploads, the worker now generates a thumbnail and stores it under:

- `uploads/thumbs`

That thumbnail path is then propagated through server message mapping and mobile sync.

## What Changed in the Server Pipeline

### Upload response got richer

Upload responses now carry more than just a file URL. They can include:

- dimensions
- duration
- waveform
- thumbnail path
- normalized MIME and media kind

### Message/media persistence was updated

To support the richer media pipeline, related changes were made in:

- `server/src/messages/messages.service.ts`
- `server/src/common/mappers.ts`
- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260325000200_add_media_thumbnail_url/migration.sql`

This includes:

- `thumbnail_url` support for media records
- proper waveform persistence
- stable mapping back to mobile clients

## What Changed on Mobile

Mobile still uses the same high-level flows, but now consumes richer server metadata.

Updated files include:

- `mobile/src/services/apiClient.ts`
- `mobile/src/services/TransportService.ts`
- `mobile/src/services/SyncService.ts`
- `mobile/src/contexts/WebSocketProvider.tsx`
- `mobile/src/services/waveformTransport.ts`

The mobile side now:

- uses server metadata for media when available
- decodes persisted waveform safely
- receives image thumbnail URLs
- has a more resilient voice upload path with MIME fallbacks

## Testing and Validation Done

Validated during implementation:

- Rust unit tests for media parsing
- Rust worker binary build
- NestJS server build
- mobile TypeScript typecheck

Known validated paths:

- text upload/message flow still works
- image upload works through Rust-enabled upload pipeline
- voice upload works again with the Rust-enabled backend path
- server finds and runs the media-worker binary correctly

## Key Files Introduced or Significantly Changed

### New / major Rust files

- `rust/Cargo.toml`
- `rust/bin/media-worker/Cargo.toml`
- `rust/bin/media-worker/src/main.rs`
- `rust/docs/media-worker-integration.md`

### Major server files

- `server/src/upload/rust-media-worker.service.ts`
- `server/src/upload/upload.service.ts`
- `server/src/upload/upload.controller.ts`
- `server/src/upload/upload.module.ts`
- `server/src/messages/messages.service.ts`
- `server/src/common/mappers.ts`
- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260325000200_add_media_thumbnail_url/migration.sql`

### Major mobile files

- `mobile/src/services/apiClient.ts`
- `mobile/src/services/TransportService.ts`
- `mobile/src/services/SyncService.ts`
- `mobile/src/contexts/WebSocketProvider.tsx`
- `mobile/src/services/waveformTransport.ts`

## What This Step Achieved

Step 2 established the first real Rust-powered production path in the project.

We now have:

- Rust integrated into the real backend runtime
- optional safe rollout instead of a risky hard cutover
- richer media metadata for current messenger features
- image thumbnail generation on the server
- waveform support in the Rust media path
- a cleaner long-term boundary:
  - NestJS owns API, auth, orchestration, and business logic
  - Rust owns heavy binary/media processing

## Remaining Work That Is Not Required to Keep Step 2 Closed

These are optional follow-ups, not blockers for Step 2 completion:

- video thumbnail generation
- deeper polish for rare `m4a/mp4/mov` edge cases
- reducing temporary debug logs once team testing is done

## Completion Criteria

Step 2 is considered complete because:

- backend can call the Rust media worker
- voice/image/video metadata can come from Rust
- mobile API compatibility was preserved
- the app continues to work with fallback behavior if Rust is unavailable

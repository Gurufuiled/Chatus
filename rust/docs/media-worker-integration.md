# Rust media-worker integration

## Что это такое

`media-worker` — это первый Rust sidecar в проекте.

Сейчас он используется сервером как optional media inspection helper для upload pipeline.

Он нужен, чтобы постепенно вынести CPU-heavy media inspection из NestJS/Node в Rust, не ломая текущий API.

## Где встроен

- `server/src/upload/upload.service.ts`
- `server/src/upload/rust-media-worker.service.ts`
- `server/.env.example`

## Как это работает

1. `UploadService` сохраняет файл в `uploads/`
2. если `RUST_MEDIA_WORKER_ENABLED=true`, сервер вызывает `media-worker`
3. worker читает файл и возвращает JSON metadata
4. сервер использует этот результат в upload response
5. если worker выключен, не найден, завис или упал, сервер делает мягкий fallback

## Что worker уже умеет

- определять `kind`
- возвращать `file_name`, `mime_type`, `file_size`
- для `PNG / JPEG / GIF / BMP` возвращать `width / height`
- для `WAV` возвращать базовый `duration_ms`
- для `WAV` возвращать server-generated `waveform`
- для `MP4 / M4A / MOV` пытаться вытащить `duration_ms` и `width / height`

## Чего он пока не делает

- реальную генерацию thumbnail
- real waveform extraction для `m4a/mp4`
- transcoding / compression
- image re-encoding

Это следующий слой развития `step2`, а не часть первого safe rollout.

## Как собрать

Из `server/`:

```powershell
npm run rust:check
npm run rust:build
```

Или release-сборка:

```powershell
npm run rust:build:release
```

## Как включить

В `server/.env`:

```env
RUST_MEDIA_WORKER_ENABLED=true
RUST_MEDIA_WORKER_TIMEOUT_MS=5000
```

Опционально можно задать путь к бинарю явно:

```env
RUST_MEDIA_WORKER_BIN=C:\\path\\to\\media-worker.exe
```

Если путь не задан, сервер ищет:

- `rust/target/release/media-worker(.exe)`
- `rust/target/debug/media-worker(.exe)`

## Почему это safe rollout

- worker выключен по умолчанию
- есть timeout
- есть fallback на обычный upload path
- API остается совместимым

## Что уже использует metadata

- `mobile/src/services/TransportService.ts`
- `mobile/src/services/SyncService.ts`

Сейчас клиент уже умеет подхватывать часть server-generated metadata:

- `width / height` для image
- `mime_type / file_name / file_size` для file/voice/video_note
- `duration_ms`, если сервер его смог определить
- `waveform` как fallback для voice, если клиент сам его не передал

## Следующий практический этап

1. real thumbnail generation
2. richer duration extraction
3. real waveform extraction for voice
4. optional image optimization path

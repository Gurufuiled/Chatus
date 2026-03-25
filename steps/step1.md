# Step 1. База под Rust и первый безопасный контур

## Цель

Подготовить проект к Rust так, чтобы внедрение было постепенным и не ломало текущий mobile/server стек.

## Почему это первый шаг

Rust лучше вводить не "везде сразу", а через один понятный контур. Для нашего проекта самым безопасным стартом будет не UI и не P2P, а CPU-heavy и file-heavy задачи.

Сейчас стек такой:

- mobile: Expo + React Native + dev build;
- server: NestJS;
- локальное хранилище на mobile: SQLite;
- медиа сейчас проходят через upload/transport pipeline;
- voice/image/file/video note уже активно используются в продукте.

Это значит, что Rust надо сначала вводить там, где:

- мало UI-рисков;
- можно четко измерить профит;
- можно оставить TS/Nest orchestration сверху.

## Что выбрать как первый реальный entry point

Первый production entry point для Rust:

- серверный media pipeline.

Первый экспериментальный entry point на mobile:

- нативный media/voice helper-модуль.

## Что решить до кода

### 1. Формат интеграции на server

Нужно выбрать один из вариантов:

1. Rust sidecar binary
2. Rust shared library / N-API
3. Отдельный Rust microservice

Для нашего проекта рекомендованный старт:

- Rust sidecar binary.

Почему:

- проще всего внедрить в NestJS;
- не требует сразу сложной Node-native интеграции;
- легче изолировать ошибки;
- можно запускать по команде из `server/src/upload/upload.service.ts` или будущего media worker.

### 2. Формат интеграции на mobile

Нужно выбрать один из вариантов:

1. полноценный native module через Android/iOS bridge;
2. Rust как core library + thin Kotlin/Swift wrapper;
3. отложить mobile Rust до server-этапа.

Для нашего проекта рекомендованный путь:

- сначала Rust на server;
- потом мобильный native module только для media/voice задач.

Почему:

- у нас Expo dev build, а не чистый bare RN-проект;
- mobile Rust можно сделать, но он сложнее;
- сначала лучше доказать пользу Rust на backend и в media-pipeline.

## Что подготовить в репозитории

### Новые зоны, которые стоит завести

1. `rust/`
2. `rust/crates/`
3. `rust/bin/`
4. `rust/docs/`

Рекомендованная стартовая структура:

```text
rust/
  Cargo.toml
  Cargo.lock
  crates/
    media-core/
    crypto-core/
    search-core/
  bin/
    media-worker/
  docs/
    integration-notes.md
```

## Какие текущие файлы проекта важно учитывать

### Server

- `server/src/upload/upload.service.ts`
- `server/src/messages/messages.service.ts`
- `server/src/websocket/websocket.gateway.ts`

### Mobile

- `mobile/src/services/VoiceRecorderService.ts`
- `mobile/src/services/VideoNoteRecorderService.ts`
- `mobile/src/services/ImagePickerService.ts`
- `mobile/src/services/MediaCacheService.ts`
- `mobile/src/services/waveformUtils.ts`
- `mobile/src/bridge/messengerBridge.ts`

## Что должно быть результатом этого шага

1. В команде согласован первый Rust entry point: `server media pipeline`.
2. В проекте есть отдельная зона `rust/` под будущие crates и binaries.
3. Есть правило:
   - Rust не трогаем для UI;
   - TS/Nest/React остаются orchestration-слоем;
   - Rust идет в CPU-heavy, file-heavy и security-heavy задачи.

## Риски

- попытаться затащить Rust в UI-логику слишком рано;
- начать сразу с mobile native module и застрять на инфраструктуре;
- не определить заранее границы ответственности между TS и Rust.

## Критерий завершения

Шаг завершен, когда:

- выбран первый Rust entry point;
- согласована repo-структура под Rust;
- команда понимает, что Rust сначала идет в media/server слой, а не в визуальную часть мессенджера.

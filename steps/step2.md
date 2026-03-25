# Step 2. Rust в server media pipeline

## Цель

Вынести тяжелую обработку медиа из NestJS в Rust, не меняя внешний API для mobile-клиента.

## Почему это лучший первый production-кандидат

Сейчас медиа уже являются важной частью продукта:

- `image`
- `voice`
- `file`
- `video_note`

На сервере уже есть точки, где это можно аккуратно расширить:

- `server/src/upload/upload.service.ts`
- `server/src/messages/messages.service.ts`

Rust здесь даст пользу раньше всего:

- меньше CPU-нагрузки на JS-слой;
- лучше работа с файлами и бинарными данными;
- легче наращивать pipeline без превращения NestJS в media-processor.

## Что именно переносить в Rust на этом шаге

### Первая волна

1. Извлечение metadata
2. Генерация thumbnail
3. Подготовка waveform для voice
4. Проверка/нормализация mime/ext
5. Опциональная оптимизация изображения

### Что пока не трогать

- auth;
- chats/messages business logic;
- websocket;
- profile API;
- call signaling.

## Как встроить в текущий backend

### Текущая логика

Сейчас upload pipeline живет в:

- `server/src/upload/upload.service.ts`

Туда можно встроить вызов Rust worker после сохранения файла:

1. Nest принимает файл
2. сохраняет временный файл
3. вызывает Rust binary
4. Rust возвращает JSON с metadata
5. Nest сохраняет результат и отдает его клиенту

## Что должен возвращать Rust worker

Рекомендуемый контракт:

```json
{
  "kind": "voice",
  "duration_ms": 12345,
  "waveform": [12, 22, 18, 30],
  "width": null,
  "height": null,
  "thumbnail_path": null,
  "mime_type": "audio/mp4",
  "file_size": 381920
}
```

Для image/video:

```json
{
  "kind": "image",
  "width": 1080,
  "height": 1920,
  "thumbnail_path": "tmp/thumb-123.jpg",
  "mime_type": "image/jpeg",
  "file_size": 824223
}
```

## Какие текущие файлы это затронет

### Точно

- `server/src/upload/upload.service.ts`
- `server/src/upload/upload.controller.ts`
- `server/src/messages/messages.service.ts`

### Возможно

- `server/src/common/mappers.ts`
- `server/src/upload/upload.constants.ts`

## Что это даст проекту уже сейчас

1. Стабильнее media metadata pipeline
2. Лучше подготовка voice waveform
3. Основа под будущие media optimization задачи
4. Более чистая граница:
   - NestJS отвечает за API, auth, бизнес-логику
   - Rust отвечает за binary/media processing

## Риски

- слишком широкий первый scope;
- попытка сразу делать transcoding всего подряд;
- отсутствие fallback-поведения, если Rust worker упал.

## Как внедрять безопасно

1. Сначала только optional worker path
2. Потом feature flag
3. Потом сравнение старого и нового metadata pipeline
4. Только потом default-on

## Критерий завершения

Шаг завершен, когда:

- backend умеет вызывать Rust media worker;
- voice/image/video metadata приходят из Rust;
- API для mobile остается совместимым.

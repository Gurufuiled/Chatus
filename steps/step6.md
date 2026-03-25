# Step 6. Rust для sync/file engine и тяжелых локальных операций

## Цель

Усилить надежность локальной очереди, file pipeline и blob-операций, не трогая UI и сетевую бизнес-логику.

## Почему этот шаг позже

Сейчас sync queue и transport у нас уже рабочие:

- `mobile/src/services/TransportService.ts`
- `mobile/src/services/SyncService.ts`
- `mobile/src/db/dao/SyncQueueDao.ts`

Это сложный участок, но его лучше трогать после того, как Rust уже доказал себя в media/security/search задачах.

## Что можно переносить

### Лучшие кандидаты

1. File dedup
2. Chunking больших файлов
3. Retry/backoff helpers
4. Очередь тяжелых локальных file-jobs
5. Integrity checks перед upload/retry

### Что пока не стоит переносить

- основную chat business logic;
- websocket orchestration;
- routing транспорта;
- экранные state machine.

## Где это встраивается сейчас

- `mobile/src/services/TransportService.ts`
- `mobile/src/services/SyncService.ts`
- `mobile/src/db/dao/SyncQueueDao.ts`
- `mobile/src/services/MediaCacheService.ts`

## Какой подход здесь правильный

Rust не должен заменять `TransportService`.

Правильнее:

- `TransportService` и `SyncService` остаются orchestration;
- Rust дает:
  - blob helpers;
  - file dedup;
  - checksum;
  - retry math;
  - chunk assembly/disassembly;
  - safe temp-file management.

## Что это даст проекту

1. Более надежную работу с большими вложениями
2. Меньше случайных file corruption кейсов
3. Чище границу между app-логикой и binary/file-логикой

## Риски

- попытка превратить Rust в "второй TransportService";
- слишком глубокий рефактор работающего sync-пути;
- смешивание transport decision logic и file-engine logic.

## Критерий завершения

Шаг завершен, когда:

- тяжелые file/blob helpers живут в Rust;
- `TransportService` и `SyncService` остаются координаторами;
- upload/retry/file-integrity путь стал стабильнее и предсказуемее.

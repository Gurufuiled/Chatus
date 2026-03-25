# Step 4. Rust для криптографии и защиты локальных данных

## Цель

Вынести security-heavy операции в Rust и подготовить проект к более сильной локальной защите данных.

## Почему это полезно уже сейчас

Даже без P2P у нас уже есть чувствительные данные:

- локальная SQLite история;
- media cache;
- токены и сессионные артефакты;
- profile/chat metadata;
- voice/image/file локальные файлы.

Rust хорошо подходит для:

- шифрования;
- подписей;
- безопасных hash utilities;
- file integrity checks.

## Что можно делать на этом шаге

### Первая волна

1. File hashing
2. Local file integrity verification
3. Encryption helpers for local blobs

### Вторая волна

4. SQLite encryption helper layer
5. Secure export/import helpers
6. Signed local metadata envelopes

## Где это ложится в текущем проекте

### Mobile

- `mobile/src/services/MediaCacheService.ts`
- `mobile/src/services/AuthService.ts`
- `mobile/src/db/`
- `mobile/src/bridge/messengerBridge.ts`

### Server

- `server/src/upload/upload.service.ts`
- будущие file-validation и integrity задачи

## Что лучше не делать сразу

- полное переписывание auth на Rust;
- сложную key-management систему без необходимости;
- глубокое шифрование всего приложения за один этап.

## Практическая польза

1. Дедуп файлов по hash
2. Проверка, что локальный blob не поврежден
3. Подготовка к более безопасному offline storage
4. Чистый reusable security-core для будущих этапов

## Риски

- слишком рано строить сложную crypto-систему;
- не договориться, где заканчивается Rust и начинается app logic;
- добавить encryption, но не встроить key-management нормально.

## Критерий завершения

Шаг завершен, когда:

- в проекте есть отдельный Rust security/core слой;
- file hash и integrity операции идут через Rust;
- есть понятный путь к шифрованию локальных медиа и части базы.

# Step 7. Rollout, сборка, CI и правила внедрения

## Цель

Сделать так, чтобы Rust в проекте был не "экспериментом", а поддерживаемой частью продукта.

## Что нужно обязательно решить

### 1. Сборка

Нужно определить:

- как собирается Rust на Windows/macOS/Linux;
- как собирается mobile native часть;
- как dev-команда поднимает проект локально без боли.

### 2. CI

Нужно добавить:

- `cargo fmt --check`
- `cargo clippy`
- `cargo test`
- smoke-check интеграции с server/mobile

### 3. Версионирование

Нужно договориться:

- Rust crates versioned independently или вместе с app;
- как фиксируются бинарники;
- как контролируются breaking changes контрактов.

### 4. Контракты между слоями

Для каждого Rust entry point должен быть явный контракт:

- входные данные;
- выходные данные;
- ошибки;
- fallback;
- telemetry.

## Как внедрять без боли

### Принцип rollout

1. сначала side path;
2. потом feature flag;
3. потом limited production use;
4. потом default-on;
5. потом удаление legacy path.

## Что стоит документировать отдельно

1. Как запускать Rust locally
2. Как дебажить Rust sidecar/native module
3. Как выглядят JSON/FFI контракты
4. Какой слой за что отвечает

## Что должно быть итогом всего плана

В проекте появляется не просто "кусок Rust", а понятная модель:

- Rust отвечает за тяжелые binary/media/search/security задачи;
- TypeScript/Nest/React Native отвечают за orchestration, UI и бизнес-логику;
- mobile и server развиваются без архитектурного хаоса.

## Рекомендуемый порядок внедрения

1. Server media pipeline
2. Mobile media/voice helper module
3. Security/hash/encryption helpers
4. Local search/index engine
5. Sync/file engine helpers
6. Полный rollout с CI и стандартами сопровождения

## Критерий завершения

Шаг завершен, когда:

- Rust включен в обычный lifecycle проекта;
- его сборка и тесты автоматизированы;
- команда понимает, где Rust действительно нужен, а где он только усложнит разработку.

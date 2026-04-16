# PROJECT_BRIEF

**Продукт:** мессенджер уровня Telegram с упором на P2P (WebRTC DataChannel), fallback WebSocket, offline-first (SQLite).

**Клиент:** React Native (Expo), TypeScript, Zustand, React Navigation. UI «тонкий»; тяжёлая логика планируется/частично в **Rust** (uniffi), в репозитории есть `mobile/`.

**Сервер:** NestJS, Prisma, PostgreSQL — `server/`.

**Транспорт сообщений:** 1) P2P → 2) WebSocket → 3) офлайн-очередь.

Подробнее см. правило Cursor `.cursor/rules/project.mdc` (не дублировать сюда весь текст — обновляй выжимку здесь при смене архитектуры).

## Ключевые папки

| Область | Путь |
|--------|------|
| RN приложение | `mobile/src/` |
| API каналов / обсуждений | `server/src/channels/` |
| Общие мапперы API | `server/src/common/mappers.ts` |

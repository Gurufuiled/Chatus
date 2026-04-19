# PROJECT_BRIEF

**Продукт:** мессенджер уровня Telegram: доставка через **сервер** (HTTP + WebSocket), offline-first (локальный SQLite и очередь).

**Клиент:** React Native (Expo), TypeScript, Zustand, React Navigation. UI и сервисы в `mobile/`.

**Сервер:** NestJS, Prisma, PostgreSQL — `server/`.

**Транспорт сообщений:** WebSocket к серверу; без сети — офлайн-очередь. **Звонки:** WebRTC + отдельный signaling WS (:4002).

Подробнее см. правило Cursor `.cursor/rules/project.mdc`.

## Ключевые папки

| Область | Путь |
|--------|------|
| RN приложение | `mobile/src/` |
| API каналов / обсуждений | `server/src/channels/` |
| Общие мапперы API | `server/src/common/mappers.ts` |

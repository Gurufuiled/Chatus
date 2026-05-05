# Текущие точки интеграции в коде

Ниже — карта **существующих** мест, куда логично встраивать P2P/гибрид без переписывания всего приложения.

**Telegram (TDLib):** сообщения и медиа Telegram **не проходят** через таблицу `messages` нашего PostgreSQL и не подпадают под `RELAY_*` / политики этого сервера. Отображение TG-чатов рядом с Chatus — задача **клиентской композиции** списка; см. [06-unified-inbox-telegram-scope.md](./06-unified-inbox-telegram-scope.md).

## Сервер (`server/`)

| Область | Файлы / модули | Что происходит сейчас |
|---------|----------------|----------------------|
| Модель сообщения | `prisma/schema.prisma` → `Message`, enum `Transport` | Поле `transport`; по умолчанию в `MessagesService.createMessage` — **`Transport.websocket`**. |
| Создание сообщения | `src/messages/messages.service.ts` | `createMessage`, `createChannelPost` (принудительно `websocket` для постов). Сюда подключается выбор `transport` и будущие правила кэша. |
| WebSocket чата | `src/websocket/websocket.gateway.ts` | Обработчик `send_message`: валидация, вызов `messagesService`, broadcast через `realtimeService`. |
| Fan-out | `src/realtime/realtime.service.ts` | `broadcastToChatMembers`, `sendToUser` — все онлайн-сессии пользователя. |
| Загрузки | Роуты загрузки / статика (см. `messages` + upload middleware в проекте) | Клиент шлёт файлы по HTTP, в сообщении уходит **URL** в `media.url`. |
| Каналы | `src/channels/channels.service.ts` | Публикации и подписчики; при создании сообщений указывается transport (сейчас websocket). |
| Сигналинг | `src/signaling/signaling.gateway.ts` | **Только WebRTC для звонков**, не для текста чата. |

## Клиент (`mobile/`)

| Область | Файлы | Назначение |
|---------|-------|------------|
| Отправка всех типов | `src/services/TransportService.ts` | Для онлайна: загрузка файла → `WebSocketService.sendEvent('send_message', …)`. Для офлайна: `queueToSyncQueue` с разными `action`. |
| Очередь синхронизации | `src/services/SyncService.ts` | Разбор `send_message_text`, `send_message_voice`, `send_message_video_note`, `send_message_image`, `send_message_video`, `send_message_file`, альбомы и т.д. — все сходятся на **`send_message` по WebSocket**. |
| WebSocket | `src/services/WebSocketService.ts` | Подписка на входящие события (`onNewMessage`, ack, typing, …). |
| Локальная БД | `src/db/schema.ts`, `src/db/dao/MessageDao.ts`, `src/db/dao/MediaDao.ts` | `messages.transport` по умолчанию **`server`**; медиа — `local_path` / `remote_url`. |
| Конфиг API / WS | `src/config.ts` | `API_BASE_URL`, `getWebSocketUrl`, `getSignalingUrl` — для новых эндпоинтов или второго канала не забыть dev/prod и Android emulator (`10.0.2.2`). |

## Цепочка для медиа (общая для типов)

1. Пользователь выбирает файл / записывает голос / кружок — UI вызывает метод **`TransportService.send*Message`**.  
2. Файл уходит на сервер через **`apiUpload` / `apiUploadVoice`** (`src/services/apiClient.ts`).  
3. В сообщение попадает **`media.url`** (полный URL) + специфичные поля (`waveform`, `thumbnail_url`, `is_round` для video_note).  
4. При офлайне та же семантика сериализуется в **`sync_queue`**, после сети — повтор шага 2–3.

Любое изменение «где лежит blob» должно учитывать **оба пути**: онлайн и `SyncService`.

## Что пока не относится к текущему коду

- Отдельный **DataChannel** для сообщений чата (не путать с портом 4002 для SDP/ICE звонков).
- **Полноценный** peer-to-peer обмен файлами без URL сервера — потребует нового протокола и UI статусов «ждём отправителя онлайн».

Эти пункты выносим в поздние фазы или отдельный spike после базового relay + политик.

# Карта кода: P2P, LineSync, mailbox и смежное

Краткий указатель **файлов по функциям**, чтобы быстрее прыгать в код при багах и регрессиях. Пути от корня репозитория (`mobile/`, `server/`).

---

## 1. Сигналинг (WebRTC SDP/ICE, `dm_*`, LineSync по signaling)

| Функция | Файлы |
|--------|--------|
| **Сервер:** ретрансляция `dm_send` / `dm_ack`, доставка `dm_deliver`, лимит чата `private` + **`group`**, WebRTC offer/answer/ICE для LineSync DC | `server/src/signaling/signaling.gateway.ts` |
| **Сервер:** модуль signaling | `server/src/signaling/signaling.module.ts` |
| **Клиент:** подключение к signaling WS, отправка `dm_send` / `dm_ack`, пересылка LineSync кадров | `mobile/src/services/SignalingService.ts` |
| **Клиент:** очередь ожидания `dm_sent` / `dm_fallback` / разбор `dm_deliver` | `mobile/src/services/peerDeliverySignal.ts` |
| **Клиент:** обёртка `attemptTextMessage` (peer-текст 1:1 и fan-out в группе) | `mobile/src/services/PeerDeliveryService.ts` |
| **Клиент:** тесты peer delivery | `mobile/src/services/PeerDeliveryService.test.ts` |
| **Клиент:** приём `dm_deliver` → SQLite + стор + LineSync для входящего текста | `mobile/src/contexts/WebSocketProvider.tsx` (подписка `PeerDeliveryService.onDmDeliver`) |

---

## 2. LineSync (протокол, tail, patch, summary, DC)

| Функция | Файлы |
|--------|--------|
| **Типы и парсинг** `LINE_SUMMARY`, `LINE_PATCH`, `LINE_PATCH_ACK`, `LINE_PATCH_REQUEST`, `message.create` | `mobile/src/services/lineSyncProtocol.ts`, `lineSyncProtocol.test.ts` |
| **Оркестрация:** tail merge, `sendSummaryToPeer`, `sendPatchAndWaitForPeerAck`, обработка входящих peer-сообщений | `mobile/src/services/LineSyncService.ts` |
| **События под `message.create`**, blob refs, альбомы | `mobile/src/services/lineSyncEventBuilder.ts`, `lineSyncEventBuilder.test.ts` |
| **Блобы:** пин, передача по DC/signaling, отмена | `mobile/src/services/LineSyncBlobService.ts` |
| **WebRTC DataChannel** для LineSync (сессии, ICE, закрытие при фоне/сети) | `mobile/src/services/LineSyncDataChannelService.ts` |
| **Разрешение медиа:** cache → peer → HTTP | `mobile/src/services/LineSyncMediaResolver.ts`, `LineSyncMediaResolver.logic.ts`, `LineSyncMediaResolver.test.ts` |
| **ACL blob по чату** | `mobile/src/services/lineSyncBlobAcl.ts`, `lineSyncBlobAcl.test.ts` |
| **Payload `line_tail` по чат-WS** | `mobile/src/services/lineSyncWebSocketPayload.ts`, `lineSyncWebSocket.test.ts` |
| **Телеметрия / dev-лог** | `mobile/src/services/LineSyncTelemetry.ts` |
| **DAO** локального event-log | `mobile/src/db/dao/LineSyncEventDao.ts` |
| **Схема SQLite** (таблицы LineSync при наличии) | `mobile/src/db/schema.ts`, `mobile/src/db/types.ts`, `mobile/src/db/index.ts` |
| **Группа:** выбор пира для summary / список участников для fan-out | `mobile/src/utils/groupLineSyncPeer.ts`, `groupLineSyncPeer.test.ts` |
| **Сервер:** HTTP tail кэша, `getTailForUser` | `server/src/linesync/linesync.controller.ts`, `linesync-cache.service.ts`, `linesync.module.ts` |
| **Экран чата:** приватный tail + summary; **групповой** tail + summary | `mobile/src/screens/ChatScreen.tsx` |
| **Общие хелперы чата** (peer user id и т.д.) | `mobile/src/screens/chatScreen.shared.tsx` |

---

## 3. Маршрутизация «peer-first vs сервер» (личка)

| Функция | Файлы |
|--------|--------|
| **Текст:** решение peer vs server | `mobile/src/services/privateTextTransportRouting.ts`, `privateTextTransportRouting.test.ts` |
| **Медиа:** решение peer-first vs upload | `mobile/src/services/privateMediaTransportRouting.ts`, `privateMediaTransportRouting.test.ts` |
| **Общее правило** «только private + один peer» для текста | `mobile/src/services/p2pSendDecision.ts`, `p2pSendDecision.test.ts` |
| **Главный оркестратор отправки** (текст, голос, фото, видео, файл, альбом, очередь) | `mobile/src/services/TransportService.ts` |
| **Очередь офлайн** и диспатч `send_message*` | `mobile/src/services/SyncService.ts` |
| **Флаги P2P** (`EXPO_PUBLIC_P2P_FIRST_*`, таймаут peer) | `mobile/src/config.ts`, `mobile/app.config.js` |
| **UI peer-first медиа** | `mobile/src/components/peerFirstMedia.tsx` |

---

## 4. Чат WebSocket (серверный путь, не signaling)

| Функция | Файлы |
|--------|--------|
| **Клиент:** `send_message`, `ack`, `mailbox_ack`, обработка `message` / `line_tail` | `mobile/src/services/WebSocketService.ts` |
| **Сервер:** входящие WS-сообщения чата | `server/src/websocket/websocket.gateway.ts`, `websocket.module.ts` |
| **Создание сообщений**, relay mailbox, политика TTL | `server/src/messages/messages.service.ts`, `messages.module.ts` |
| **Пуш** при офлайне получателя | `server/src/push/` (при необходимости уточнить по импортам в `messages.service`) |

---

## 5. Mailbox (личка fallback, TTL, prune, файлы uploads)

| Функция | Файлы |
|--------|--------|
| **Доставка ожидающих mailbox**, `markMailboxDelivered` (снимает только `mailbox_expires_at`), cron prune + удаление файлов для просроченных | `server/src/mailbox/mailbox.service.ts`, `mailbox.module.ts` |
| **Тесты mailbox** | `server/src/mailbox/mailbox.service.spec.ts` |
| **Best-effort удаление файла** по URL `/uploads/…` | `server/src/upload/upload.service.ts`, `upload.module.ts`, `upload.service.spec.ts` |

---

## 6. Политика relay / mailbox на сервере

| Функция | Файлы |
|--------|--------|
| **ENV → снимок политики** (`RELAY_*`, `LINE_SYNC_TAIL_*`) | `server/src/config/relay-policy.config.ts`, `relay-policy.config.spec.ts` |
| **Админ-оверрайды** relay | `server/src/admin/admin-relay-policy.service.ts`, `admin-relay-policy.controller.ts` |

---

## 7. Retention (хвост N сообщений в БД для group/channel/discussion)

| Функция | Файлы |
|--------|--------|
| **Cron prune**, пересчёт `last_message*` | `server/src/messages/messages-retention.service.ts` |
| **Тесты** | `server/src/messages/messages-retention.service.spec.ts` |

---

## 8. Схема БД и миграции (P2P-связанные поля)

| Функция | Файлы |
|--------|--------|
| **Prisma-схема** (`Message`, `LineSyncCacheEvent`, media SHA256 и т.д.) | `server/prisma/schema.prisma` |
| **Миграции** (mailbox, LineSync cache, media) | `server/prisma/migrations/` (смотреть по дате/имени, например `*linesync*`, `*media_sha256*`) |

---

## 9. Документы-источники правды (не код, но для контекста бага)

| Тема | Файл |
|------|------|
| Переориентация P2P-first | `docs/p2p/07-p2p-first-reorientation.md` |
| Протокол LineSync | `docs/p2p/08-linesync-protocol-draft.md` |
| План внедрения + журнал | `docs/p2p/09-linesync-implementation-plan.md` |
| Серверная копия / mailbox | `docs/p2p/10-server-copy-only-offline-mailbox.md` |
| Env сервера (пример) | `server/.env.example` |

---

## Как пользоваться при баге

1. **Не доходит текст в личке по peer** → §1 (signaling + `PeerDeliveryService`) + §3 (`privateTextTransportRouting`, `TransportService.sendMessage`).
2. **Не доходит медиа без upload** → §2 (`LineSyncService`, `LineSyncBlobService`, `TransportService`) + §3 (`privateMediaTransportRouting`).
3. **Дубли / нет слияния temp и сервера** → `WebSocketProvider` + `TransportService` + DAO сообщений.
4. **Группа: нет tail / нет добора с пира** → `ChatScreen` + `LineSyncService` + `groupLineSyncPeer`.
5. **Группа: нет P2P дубля текста** → `TransportService` (fan-out) + `signaling.gateway` (`dm_send` для group) + `WebSocketProvider` (`dm_deliver`).
6. **Mailbox / TTL / файлы на диске** → `messages.service` + `mailbox.service` + `upload.service`.
7. **Пропали старые сообщения в группе/канале** → `messages-retention` + `.env` `MESSAGES_SERVER_RETENTION_*`.

При добавлении новых модулей имеет смысл **дописать строку** в соответствующий раздел этого файла.

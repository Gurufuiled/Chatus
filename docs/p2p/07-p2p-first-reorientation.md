# Переориентация реализации на P2P-first

Этот файл фиксирует, какие server-first правки остаются полезными как fallback/mailbox, а где нужен отдельный peer-путь.

| Файл / область | Было | Стало / целевое разделение |
|----------------|------|----------------------------|
| `server/src/config/relay-policy.config.ts` | Конфиг воспринимался как политика основного server relay. | Конфиг хранит mailbox policy (`RELAY_*`) и согласованные параметры peer attempt (`P2P_*`) для fallback-логики. |
| `server/src/messages/messages.service.ts` | `createMessage` — основной путь создания всех сообщений. | Остаётся server mailbox/fallback путём; успешный peer-путь не должен принудительно становиться полным server-write. |
| `server/src/common/mappers.ts` | `transport` отдавался для server-created сообщений. | `websocket` означает server relay/mailbox; `p2p` зарезервирован для успешного peer-пути/учёта. |
| `mobile/src/config.ts` | Не было явной настройки peer-first. | Добавлены `EXPO_PUBLIC_P2P_FIRST_ENABLED` и `EXPO_PUBLIC_P2P_PEER_ATTEMPT_TIMEOUT_MS` для будущего оркестратора. |
| `mobile/src/services/TransportService.ts` | Онлайн: сразу WebSocket `send_message`; офлайн: `sync_queue`. | Для private 1:1 должен стать оркестратором: peer attempt → timeout/error → текущий WebSocket/mailbox fallback. |
| `mobile/src/services/SyncService.ts` | Все retry сходятся в WebSocket `send_message`. | Остаётся retry для server fallback; не подменяет успешную peer-доставку. |
| `mobile/src/utils/messageTransport.ts` | Нормализация legacy `server` / `ws` / `api` в `websocket`. | Сохраняется; `p2p` не нормализуется в `websocket` и должен отражать успешную peer-доставку. |
| `mobile/src/db/dao/MessageDao.ts` / `schema.ts` | SQLite хранит `transport`. | Хранит фактический путь: `p2p` для peer success, `websocket` для mailbox/server fallback. |
| Каналы / группы | Server fan-out и хранение. | Не меняются в первых фазах; P2P-first применяется к личке 1:1. |

## Реализация фазы 2: первый клиентский шаг

Добавлен клиентский `PeerDeliveryService` со stub-реализацией и подключена ветка в `TransportService.sendMessage` для текстовых сообщений private 1:1:

1. если `EXPO_PUBLIC_P2P_FIRST_ENABLED=true`, клиент ищет peer в private-чате;
2. выполняет `peer_attempt`;
3. при успехе будущего peer-слоя optimistic message помечается `transport: p2p`;
4. при `not_implemented` / ошибке / отсутствии peer идёт текущий server fallback (`transport: websocket`, WebSocket или `sync_queue`).

Stub пока всегда возвращает `not_implemented`; следующий коммит должен заменить его на signaling + DataChannel или другой согласованный peer-протокол.

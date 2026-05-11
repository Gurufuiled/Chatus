# LineSync: план внедрения и журнал прогресса

Целевая продуктовая модель (кратко): **минимум данных на сервере** — личка: P2P + mailbox для недошедшего; группы: **окно N** на сервере + добор истории с пиров. Подробнее: `08-linesync-protocol-draft.md`, раздел «Целевая модель минимального хранения на сервере».

Этот файл — **дорожная карта по этапам** и **журнал**, что уже сделано в коде (обновлять после значимых изменений, чтобы не терять контекст между сессиями).

---

## Этапы внедрения

### Этап A — Подготовка локального LineSync-контекста (без смены транспорта текста)

| ID | Задача | Статус |
|----|--------|--------|
| A1 | При открытии **приватного** чата: подтянуть **server tail** LineSync в локальный event-log (`fetchServerTail`), лимит **5** (`LINE_SYNC_PRIVATE_TAIL_LIMIT`). | сделано |
| A2 | Дедуп запросов tail: **один успешный** GET на «визит» (фокус-сессию) на `chatId`; сброс при смене чата / потере фокуса. | сделано |
| A3 | После tail (или параллельно при наличии peer): **LINE_SUMMARY → peer** и при необходимости **LINE_PATCH_REQUEST / LINE_PATCH** с **собеседником** в личке (`sendSummaryToPeer` + обработка уже есть в `LineSyncService`). Нужны: `peerUserId` из `members`, условия (signaling подключён, не спамить). | сделано |
| A4 | Опционально: **`line_tail_request` по WebSocket** — только если ответ `line_tail` **мержится в DAO** на клиенте; иначе оставить HTTP tail. | сделано (мерж в `LineSyncEventDao` через `mergeLineTailWebSocketMessage` + `onLineTail` в `WebSocketProvider`; приватный чат по-прежнему тянет tail по HTTP; `requestServerTailOverWebSocket` — при необходимости отдельно) |

### Этап B — Личка: протокол текста «сначала P2P, потом сервер»

| ID | Задача | Статус |
|----|--------|--------|
| B1 | Спецификация: когда создавать запись в `messages`, когда только событие в LineSync + доставка по signaling/DC. | сделано (раздел «Этап B (личка): запись в `messages`, LineSync и на сервере» в `08-linesync-protocol-draft.md`; перекрёстное обновление блока «Оставшиеся шаги») |
| B2 | Клиент: попытка отправки текста по выбранному P2P-пути → ACK получателя → **не** полная серверная копия (или пометка транспорта). | сделано (`transport: 'p2p'` в сторе; `sync_state: p2p_delivered` в `line_sync_events` для `msg:<tempId>`) |
| B3 | Fallback: таймаут / офлайн → текущий **`send_message` + `relay_mailbox`**. | сделано (существующий `sendTextViaServerOrQueue` / `SyncService` для private) |
| B4 | Согласование UI (список сообщений) и локального event-log без дублей. | сделано (слияние по `client_temp_id` + `linkServerMessageIdForOptimisticTemp` в `WebSocketProvider`; P2P без серверного echo — отдельный `event_id`, дубля нет) |

### Этап C — Группы / каналы: окно N на сервере

| ID | Задача | Статус |
|----|--------|--------|
| C1 | Политика **retention**: хранить только последние **N** (например 10–20) сообщений в БД или отдельный слой; prune / миграции. | сделано (`MessagesRetentionService`: cron раз в сутки, `MESSAGES_SERVER_RETENTION_*`, только `group` / `channel` / `discussion`; после удаления обновляется `Chat.last*`; по умолчанию выкл.) |
| C2 | Клиент: tail при открытии **группового** чата (лимит ≠ личка). | сделано (`LINE_SYNC_GROUP_TAIL_LIMIT = 15`, `fetchServerTail` в `ChatScreen` для `chat_type === 'group'`, дедуп ref как у приватного tail) |
| C3 | Peer sync (summary/patch) как основной добор истории старше окна. | сделано (`sendSummaryToPeer` после группового tail; `getGroupLineSyncPeerUserId`; дедуп `chatId|peerId`; `retain_last_n` = `LINE_SYNC_GROUP_TAIL_LIMIT` для группы) |

### Этап D — Надёжность и продукт

| ID | Задача | Статус |
|----|--------|--------|
| D1 | DataChannel: переподключение при смене сети / фоне. | сделано (`closeAllSessions`: при закрытии signaling WS; offline→online и online→offline в `WebSocketProvider`; при `AppState === 'background'`) |
| D2 | UX: индикация источника медиа / прогресс больших файлов / отмена. | сделано (`usePeerFirstFileResolve`, оверлей прогресса/«Отмена» на `PeerFirstFileBubble`; бейджи P2P/Кэш; прогресс по чанкам в `LineSyncBlobService`) |
| D3 | Тесты: сценарий resolver «mirror → local → HTTP»; при необходимости интеграционный. | сделано (`LineSyncMediaResolver.logic.ts` + `LineSyncMediaResolver.test.ts`: cache / peer / fallback HTTP / порядок mirror) |

---

## Журнал выполненного

Формат: **дата (UTC по системе репозитория)** — кратко что изменилось (файлы / поведение).

| Дата | Изменения |
|------|-----------|
| **2026-05-07** | **A1, A2:** В `LineSyncService` добавлен `LINE_SYNC_PRIVATE_TAIL_LIMIT = 5`. В `ChatScreen` при фокусе **приватного** чата вызывается `fetchServerTail(chatId, limit)` после `InteractionManager.runAfterInteractions`; ошибки логируются через `warnLineSyncLocalInsert`. Дедуп: ref `privateServerTailFetchedRef` — повторный успешный запрос не уходит, пока пользователь остаётся на экране с фокусом; сброс при смене `chatId` или `isFocused === false`. |
| **2026-05-07** | **A3:** После tail вызывается `sendSummaryToPeer`; `getPrivateChatPeerUserId` в `chatScreen.shared.tsx`; дедуп `privatePeerSummarySentRef`. Дополнительно: `privateLineSyncGenRef` отбрасывает устаревшие async после смены deps; в deps добавлен `privatePeerMembersSignature`, чтобы после подгрузки `members` выполнился handshake с известным peer. |
| **2026-05-07** | **A4:** Общая вставка tail-ивентов вынесена в `mergeCacheTailEvents`; ответ чат-WebSocket `line_tail` обрабатывается в `mergeLineTailWebSocketMessage` и регистрируется как `onLineTail` в `WebSocketProvider`. Ошибки сервера (`error` в payload) не мержатся; дубликаты по `event_id` по-прежнему через `INSERT OR IGNORE` в DAO. После ревью: любое непустое `error` логируется через `console.warn` и в production. |
| **2026-05-07** | **B1:** В `08-linesync-protocol-draft.md` добавлена спецификация этапа B для лички (три слоя, ветки отправки, кадры signaling). Уточнён блок «Оставшиеся шаги» §1. После ревью: таблица слоёв (`messageStore` / SQLite), `dm_sent` / `dm_fallback`, дисклеймер про P2P-only личку. |
| **2026-05-07** | **B2–B4:** P2P `p2p_delivered` в LineSync, порядок insert → `sendMessage` в `ChatScreen`, обновлены `08` / план. |
| **2026-05-07** | **C2:** `LINE_SYNC_GROUP_TAIL_LIMIT = 15`, `fetchServerTail` в `ChatScreen` для `chat_type === 'group'`. |
| **2026-05-08** | **C1:** На сервере добавлен `MessagesRetentionService`: ежедневный prune (`EVERY_DAY_AT_3AM`, время локально для процесса Node) при `MESSAGES_SERVER_RETENTION_ENABLED=1`. Топ-N считается по **не удалённым** сообщениям; после удаления — очистка битых `thread_root_message_id` и пересчёт `Chat.last*`. Область: `group` / `channel` / `discussion`; закреп сохраняется; лички не затрагиваются. |
| **2026-05-07** | **C3:** Для группового чата после `fetchServerTail` вызывается `sendSummaryToPeer` к первому по сортировке `user_id` другому участнику (`getGroupLineSyncPeerUserId` в `mobile/src/utils/groupLineSyncPeer.ts`); дедуп по `chatId|peerId`; `retain_last_n` в summary совпадает с `LINE_SYNC_GROUP_TAIL_LIMIT`; тесты в `groupLineSyncPeer.test.ts`. |
| **2026-05-07** | **D1:** `LineSyncDataChannelService.closeAllSessions()` + подписка на закрытие signaling-сокета; в `WebSocketProvider` сброс DC при переходе сети offline↔online и при уходе приложения в `background` (не при кратком `inactive`). Следующий `ensureOpen` заново поднимает RTC/DataChannel. |
| **2026-05-07** | **D2:** Прогресс и отмена загрузки файла с пира (`AbortSignal`, `onProgress` в blob pipeline); `PeerFirstFileBubble` — оверлей и бейджи источника; телеметрия `peer_first` учитывает `cache`. |
| **2026-05-07** | **D3:** Логика resolver вынесена в `LineSyncMediaResolver.logic.ts` (без RN `config`); Node-тест `LineSyncMediaResolver.test.ts` сценарии cache → peer → HTTP fallback; `LineSyncTelemetry.devLog` безопасен в Node (`__DEV__`). |

---

## Как обновлять журнал

После завершения задачи из таблицы этапов:

1. Перевести строку в статус **сделано** (или частично — кратко уточнить).
2. Добавить строку в **Журнал выполненного** с датой и 2–5 предложениями (что, где).

При смене приоритетов — править таблицы этапов, не удалять историю журнала без необходимости.

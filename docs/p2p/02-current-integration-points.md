# Текущие точки интеграции в коде

Ниже — карта мест для перехода от **текущего server-first** к **P2P-first + mailbox fallback**.

## Важно: состояние репозитория сейчас

**Фактически сегодня** все исходящие сообщения Chatus идут через **HTTP upload + WebSocket `send_message`** → запись в PostgreSQL → broadcast. Это **не** целевая модель, а отправная точка рефакторинга.

**Целевая модель** — в [01-terminology-and-principles.md](./01-terminology-and-principles.md): попытка peer → при неуспехе тот же пайплайн через сервер как **mailbox**.

**Telegram (TDLib):** сообщения Telegram **не проходят** через наш `messages` и не подпадают под P2P-first Chatus. См. [06-unified-inbox-telegram-scope.md](./06-unified-inbox-telegram-scope.md).

## Сервер (`server/`)

| Область | Файлы / модули | Сейчас | Куда встраивать P2P-first |
|---------|----------------|--------|----------------------------|
| Модель сообщения | `prisma/schema.prisma` → `Message`, enum `Transport` | По умолчанию `websocket` при создании через API | Явная установка `p2p` только когда сообщение **не** создано полным server-write (или метаданные peer-sync — по фазам) |
| Создание сообщения | `src/messages/messages.service.ts` | Всегда `createMessage` при отправке | Разделить путь: **mailbox** только для fallback; возможна запись «облегчённая» для peer-only (спецификация в фазах) |
| WebSocket чата | `src/websocket/websocket.gateway.ts` | Единственный путь чата | Остаётся каналом для fallback, статусов, sync |
| Fan-out | `src/realtime/realtime.service.ts` | Всем членам | Для групп/каналов — основной механизм |
| Загрузки | Upload routes | Файл на диск, URL в сообщении | При peer-доставке файла — по политике: меньше обязательных upload на сервер в личке |
| Каналы | `src/channels/channels.service.ts` | Посты через сервер | Без изменения главной идеи «сервер хранит посты» |
| Сигналинг | `src/signaling/signaling.gateway.ts` | Звонки | Расширение под **Data Channel для текста** — отдельная задача; не ломать звонки |

## Клиент (`mobile/`)

| Область | Файлы | Сейчас | Цель |
|---------|-------|--------|------|
| Отправка | `TransportService.ts` | Всегда upload + WS | **В начале цепочки:** попытка peer-транспорта для 1:1 → затем текущий путь |
| Очередь | `SyncService.ts` | Все к `send_message` | Очередь до «сообщение принято peer **или** сервером» |
| WebSocket | `WebSocketService.ts` | Приём от сервера | Приём fallback и синхронизации |
| SQLite | `MessageDao`, `media` | `transport` ~ server | Маппинг `p2p` / `websocket` по факту доставки |
| Signaling | связать с существующим `SignalingService` | Звонки | Общая жизнь соединения для DC — проектное решение |

## Цепочка для медиа

Сейчас: всегда upload → URL → WS. В целевой модели для **1:1** возможна передача blob по peer; при фолбэке — как сейчас. См. [04-message-types-and-media.md](./04-message-types-and-media.md).

## Что потребует нового кода

- Установление peer-сессии для чата (поверх или рядом с signaling 4002).
- Протокол подтверждения доставки по peer для статусов и учёта.
- Явный **fallback-таймаут** → постановка в mailbox на сервере.

Эти пункты раскладываются по [03-rollout-phases.md](./03-rollout-phases.md).

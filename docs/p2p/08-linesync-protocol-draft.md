# LineSync: черновик peer-assisted протокола для личек, групп и каналов

Этот документ описывает **протокольную модель** для будущего peer-assisted sync: участники обмениваются не только сообщениями "в момент отправки", а сверяют состояние общих потоков (**line**) и догружают недостающие события друг у друга или у серверного cache-node.

Документ не заменяет текущую реализацию фазы 2 (signaling: исходящий **`dm_send`**, подтверждение доставки отправителю **`dm_sent`** / отказ **`dm_fallback`**, входящий **`dm_deliver`**, **`dm_ack`** получателя). Это следующий слой для групп, каналов, мультидевайса и более общей peer-синхронизации.

**Медиа:** в протоколе заложены **P2P-раздача blob** (кадры `BLOB_*`) и **обязательный запасной путь** через URL на сервере в `BlobRef.locations`; порядок источников определяет клиент.

## Цель

Сделать один общий протокол синхронизации для:

- **лички 1:1** — два участника, peer-first, сервер mailbox/cache как fallback;
- **группы** — участники могут обмениваться хвостом истории peer-assisted, сервер держит минимальный хвост и fallback;
- **канала** — писать могут owner/admins с правом публикации, подписчики могут peer-assisted раздавать уже опубликованный хвост, сервер остаётся якорем прав и минимальной истории.

Целевое разбиение «что хранит сервер vs что живёт у клиентов и в P2P» зафиксировано в разделе **«Целевая модель минимального хранения на сервере»** ниже.

Главная идея: **line** — это реплицируемый лог событий. Сообщение, редактирование, удаление, вступление участника — всё событие в этом логе.

## Целевая модель минимального хранения на сервере

Этот блок фиксирует **продуктовую задумку**: сервер не обязан быть полным архивом переписки. Ниже — целевое разделение ролей; **текущий код** может отличаться (часть пути всё ещё «каждое сообщение пишется в `messages` навсегда», **за исключением** успешной P2P-доставки текста в личке без `send_message`), пока не завершена миграция.

### Принцип

- **Полная длинная история** — в приоритете у **клиентов** в локальном LineSync event-log и в **peer-assisted** обмене (summary/patch, при необходимости медиа через `BLOB_*` / DataChannel).
- **Сервер** — координация (сигналинг, права, членство), **короткое окно** для cold start и **буфер** для того, что не удалось доставить по P2P.

Так избегаем «двух миров без правил»: либо UI и протокол договариваются, что **истина для полной истории** — LineSync + пиры, а строки в PostgreSQL — только mailbox/окно N; либо осознанно остаёмся на сервере как полной книге. Этот документ идёт по первому пути.

### Личка (1:1)

| Роль | Целевое поведение |
|------|-------------------|
| **P2P** | Когда оба онлайн и установлен прямой канал (сигналинг + negotiation), новые события **доставляются участнику напрямую**; постоянная копия **всей** переписки на сервере **не требуется**. |
| **Mailbox** | На сервере остаётся то, что **не доехало** по P2P: собеседник офлайн, нет маршрута, таймаут. Политика TTL/квоты (`relay_mailbox`, `mailbox_expires_at`, relay policy) описывает именно **буфер недоставленного**, а не бесконечный архив. |

### Группы и каналы

| Роль | Целевое поведение |
|------|-------------------|
| **Окно N на сервере** | Сервер хранит и отдаёт только **последние N сообщений** (порядок величины **10–20**, конфигурируемо) — для **входа нового участника**, **отставшего клиента** и подстраховки, пока **нет доступных пиров**. |
| **Старее окна** | Догружается **с пиров**, когда они в онлайне (`LINE_SUMMARY` / `LINE_PATCH`, расширение доступного лога у каждого клиента). |

Для **канала** публикация и права по-прежнему якорятся на сервере; «хвост» публичного контента может следовать той же логике окна N + peer-assisted раздача уже опубликованных событий подписчиками (см. таблицу прав для `channel` в разделе «Правила записи в line» ниже).

### Серверный LineSync cache-tail vs таблица `messages`

- Таблица **`line_sync_cache_events`** и endpoint **`GET /lines/:lineId/events/tail`** реализуют **короткий хвост событий LineSync** на сервере (с лимитом и TTL) — это слой **cache-node**, согласованный с идеей «немного строк для cold start».
- Она **не заменяет автоматически** политику retention для классической таблицы **`messages`**, пока основной API истории чата читает именно её. Целевая конвергенция: либо **`messages`** сжимается до роли «mailbox + последние N», либо UI истории переводится на event-log + серверный хвост как единственный согласованный источник после онбординга.

### Связь с разделами ниже

Типы событий (`message.create`, …), обмен `LINE_*`, blob mirrors и раздел про rollout — это **технические кирпичи** под описанную модель. Реализация идёт итерациями; статус «что уже в коде» см. в конце документа.

## Этап B (личка): запись в `messages`, LineSync и на сервере

Спецификация **B1** из плана внедрения (`09-linesync-implementation-plan.md`): где живёт истина для исходящего **текста**, пока UI истории опирается на SQLite `messages`, а долгая история и медиа-resolution — на локальный LineSync event-log.

### Три слоя данных

| Слой | Роль для текста в личке |
|------|-------------------------|
| **Локальная таблица `messages`** | **`messageStore`** отображает список; SQLite **`messages`** пополняется там, где есть **`MessageDao.insert`** (входящие P2P/mailbox/WS, синхронизация и т.д.). Исходящий текст из `ChatScreen`: **`prependMessage`** в стор и вставка в LineSync; немедленная запись того же исходящего в SQLite не гарантируется для всех веток. Статусы `sending` / `sent` / `failed`, **`transport`** (`p2p`, `websocket`, …). |
| **Локальный LineSync event-log** (`LineSyncEventDao`) | Долговечный лог событий `message.create` для сверки с пиром, tail/cache на сервере и peer-assisted медиа; строки со **`sync_state`** (`pending`, `server_tail`, …). |
| **Серверная таблица `messages` (PostgreSQL)** | Сейчас основной источник для истории при синхронизации и для собеседника, если доставка пошла через **`send_message`**. При успешной доставке **только по P2P** без fallback запись на сервер **может не создаваться** — это соответствует целевой модели «не полный архив на сервере». |

### Исходящий текст: ветки клиента (как в коде)

Цепочка: `ChatScreen` добавляет оптимистичное сообщение в **`messageStore`**, при тексте вызывает `buildPendingLineSyncRowFromOutgoingMessage` → вставка в LineSync, затем `TransportService.sendMessage` (`mobile/src/services/TransportService.ts`).

1. **P2P-first** (`decideP2PTextAttempt` → `PeerDeliveryService.attemptTextMessage`): signaling **`dm_send`**; успех исходящей попытки по **`dm_sent`**, провал по **`dm_fallback`** или таймауту (входящая доставка собеседнику — **`dm_deliver`**, ответный **`dm_ack`**). При **`ok`** клиент помечает сообщение **`transport: 'p2p'`**, **`send_message` на чат-WebSocket не вызывается** — значит **нет** немедленной серверной строки из этого отправления. В LineSync для `event_id = msg:<tempId>` выставляется **`sync_state = p2p_delivered`** (см. `TransportService` / `LINE_SYNC_SYNC_STATE_P2P_DELIVERED`). Локально уже есть строка в сторе и pending-событие в LineSync.
2. **Fallback на сервер**: тот же вызов завершается в `sendTextViaServerOrQueue` — `send_message` по WS или постановка в офлайн-очередь; для приватного текста добавляется **`relay_mailbox: true`** (буфер недоставленного для второй стороны).
3. **Офлайн**: очередь синхронизации затем выполняет тот же WS-путь (`SyncService`), что эквивалентно ветке 2 после появления сети.

### Целевые правила для B2–B4 (продукт)

- **B2:** семантика транспорта: `transport` в сторе + `p2p_delivered` в LineSync при успешном P2P-тексте; серверный echo не ожидается.
- **B3:** таймаут / офлайн → **`send_message` + `relay_mailbox`** (и очередь).
- **B4:** слияние оптимистичного пузыря с сервером по `client_temp_id` и `linkServerMessageIdForOptimisticTemp`; при P2P — один `event_id` без серверного дубля.

Ниже в документе раздел «Оставшиеся шаги» ссылается на согласование транспорта текста — детали исходящего пути см. в этом блоке.

## Базовые сущности

```ts
type NodeId = string;      // устройство пользователя, сервер, cache-node, extra-memory node
type UserId = string;
type DeviceId = string;
type LineId = string;      // private chat / group / channel
type EventId = string;     // stable id события: uuid или hash(content + author + clock)
type Cursor = string;      // позиция в логе: seq, vector-clock или compact DAG head
```

### Line

```ts
type LineType = 'private' | 'group' | 'channel';

type LineMeta = {
  line_id: LineId;
  line_type: LineType;
  head_event_ids: EventId[];   // одна или несколько "голов", если события пришли параллельно
  cursor: Cursor | null;       // компактная позиция для быстрого since-запроса
  updated_at: number;
  retain_last_n: number;       // желаемый минимальный хвост, например 10
  ttl_seconds?: number;        // сколько сервер/cache-node держит хвост
};
```

Почему `head_event_ids`, а не один `last_message_id`: в группе два участника могут написать одновременно. Один "последний id" плохо описывает такую развилку; несколько голов позволяют потом слить события без потери.

## Правила записи в line

Право "писать в line" означает право добавлять **новые события** в лог. Узел, который получил событие от пира, обязан проверить, имеет ли автор право на этот тип события.

| Тип line | Кто может писать `message.create` | Кто может редактировать | Кто может удалять |
|----------|-----------------------------------|--------------------------|-------------------|
| `private` | два участника лички | автор своего сообщения | автор своего сообщения; опционально "удалить у себя" как локальное событие |
| `group` | участники группы | автор своего сообщения; админы по политике | автор своего сообщения; админы/owner могут удалять чужие |
| `channel` | owner, admins с `can_post` | owner/admins; автор поста только если он всё ещё owner/admin | owner/admins с `can_delete`; автор только если он всё ещё owner/admin |

Подписчики канала **не пишут посты** в line канала. Они могут только хранить и раздавать уже валидные события peer-assisted, если событие подписано автором/админом и прошло проверку прав.

## События лога

Минимальный набор:

```ts
type LineEvent =
  | MessageCreateEvent
  | MessageEditEvent
  | MessageDeleteEvent
  | MemberJoinEvent
  | MemberLeaveEvent
  | MemberRoleUpdateEvent
  | LinePolicyUpdateEvent;
```

### Создание сообщения

```ts
type MessageCreateEvent = {
  type: 'message.create';
  event_id: EventId;
  line_id: LineId;
  author_user_id: UserId;
  author_device_id: DeviceId;
  created_at: number;
  logical_clock: number;
  parent_event_ids: EventId[]; // предыдущие известные головы line
  content_type:
    | 'text'
    | 'image'
    | 'voice'
    | 'video_note'
    | 'video'
    | 'file'
    | 'system'
    | 'media_album'; // несколько слотов; тип каждого слота — в blob_refs[i].kind
  content?: string;
  blob_refs?: BlobRef[];
  reply_to_event_id?: EventId | null;
  signature: string;
};
```

Для **`media_album`** одновременно фото и видео в одном сообщении: обязательно **`blob_refs` из двух и более элементов**; верхний `content_type` не заменяет пер-слотовые виды — при отображении и резолве медиа опирайтесь на **`blob_refs[i].kind`**. Однородный альбом (все кадры `image` или все `video`) по-прежнему может использоваться с `content_type` **`image`** / **`video`** и несколькими refs одного `kind`.

### Редактирование

Редактирование не затирает старое событие. Добавляется новое событие:

```ts
type MessageEditEvent = {
  type: 'message.edit';
  event_id: EventId;
  line_id: LineId;
  target_event_id: EventId;
  editor_user_id: UserId;
  editor_device_id: DeviceId;
  edited_at: number;
  edit_revision: number;
  new_content?: string;
  new_blob_refs?: BlobRef[];
  reason?: string;
  signature: string;
};
```

Правило применения:

- если редактор — автор исходного сообщения, правка разрешена по политике line;
- если редактор — админ/owner, проверяются права `can_edit`;
- если пришли две правки одной версии, выигрывает событие с валидной подписью и детерминированным tie-breaker (`edited_at`, затем `event_id`), но лучше запрещать одинаковый `edit_revision` от одного автора.

UI показывает последнюю разрешённую правку и отметку "изменено". Историю правок можно хранить локально или не показывать, но для sync событие остаётся в логе.

### Удаление

Удаление тоже событие:

```ts
type MessageDeleteEvent = {
  type: 'message.delete';
  event_id: EventId;
  line_id: LineId;
  target_event_id: EventId;
  deleter_user_id: UserId;
  deleter_device_id: DeviceId;
  deleted_at: number;
  delete_mode: 'for_me' | 'for_everyone';
  reason?: string;
  signature: string;
};
```

Правило применения:

- `for_me` — локальное скрытие на устройстве/аккаунте, его не обязательно распространять всем;
- `for_everyone` — распространяется как обычное событие, но принимается только если `deleter_user_id` имеет право удалить `target_event_id`;
- тело сообщения можно скрыть в UI сразу после применения delete-события;
- сервер/cache-node по TTL может физически вычищать `content`/blob, но желательно сохранять tombstone: `event_id`, `target_event_id`, `deleted_at`, чтобы узлы не "воскрешали" старое сообщение при sync.

## Сверка состояния

### 1. Обнаружение пира

Транспорт может быть любым: WebRTC DataChannel, WebSocket signaling-relay, локальная сеть, серверный cache-node. Протокол LineSync начинается после того, как узлы уже могут обмениваться JSON-фреймами.

```ts
type HELLO = {
  type: 'HELLO';
  protocol: 'linesync';
  version: 1;
  node_id: NodeId;
  user_id?: UserId;
  device_id?: DeviceId;
  capabilities: {
    max_patch_events: number;
    supports_blobs: boolean;
    supports_cache_node: boolean;
  };
};
```

### 2. Краткая сводка line

```ts
type LINE_SUMMARY = {
  type: 'LINE_SUMMARY';
  node_id: NodeId;
  lines: LineMeta[];
};
```

Узел не обязан отправлять все line сразу. Для экономии можно отправлять только выбранные чаты: открытый чат, закреплённые, последние активные.

### 3. Запрос недостающих событий

```ts
type LINE_PATCH_REQUEST = {
  type: 'LINE_PATCH_REQUEST';
  line_id: LineId;
  mode: 'since_cursor' | 'last_n' | 'by_ids' | 'between_heads';
  since_cursor?: Cursor | null;
  last_n?: number;
  event_ids?: EventId[];
  known_head_event_ids?: EventId[];
  max_events: number;
};
```

Рекомендуемый MVP:

1. для лички и маленьких групп — `since_cursor`;
2. для нового участника/нового устройства — `last_n`;
3. для расхождения голов — `by_ids` или `between_heads`.

### 4. Патч событий

```ts
type LINE_PATCH = {
  type: 'LINE_PATCH';
  line_id: LineId;
  base_cursor: Cursor | null;
  new_cursor: Cursor | null;
  events: LineEvent[];
  has_more: boolean;
};
```

Получатель применяет события только после проверок:

- валидная структура;
- валидная подпись автора;
- автор/редактор/удаливший имеет право на действие;
- событие относится к известному `line_id`;
- размер патча и blob_refs не превышают лимиты;
- дубликаты игнорируются.

### 5. Подтверждение

```ts
type LINE_PATCH_ACK = {
  type: 'LINE_PATCH_ACK';
  line_id: LineId;
  applied_event_ids: EventId[];
  rejected_event_ids?: Array<{
    event_id: EventId;
    reason:
      | 'duplicate'
      | 'bad_format'
      | 'invalid_signature'
      | 'no_permission'
      | 'unknown_line'
      | 'too_large';
  }>;
  new_head_event_ids: EventId[];
  new_cursor: Cursor | null;
};
```

## Сервер как cache-node

Сервер в этой модели — не обязательно главный автор истории, а **доступный узел с политикой хранения**.

```ts
type CACHE_POLICY = {
  type: 'CACHE_POLICY';
  line_id: LineId;
  retain_last_n: number;       // например 10
  ttl_seconds: number;         // например 86400
  accepts_events: boolean;     // можно ли присылать ему хвост для cache
  requires_server_validation: boolean;
};
```

Рекомендованная политика:

- **личка**: сервер принимает только fallback/mailbox, удаляет после pickup/TTL;
- **группа**: сервер держит последние `N` событий или TTL-хвост, чтобы новый/вернувшийся участник мог стартовать без онлайн-пиров;
- **канал**: сервер остаётся сильнее, чем peer, потому что канал требует предсказуемой истории, модерации и прав; peer-assisted может раздавать хвост, но сервер должен уметь отдать минимум `N` последних валидных постов.

## Blob / медиа и P2P-раздача (часть протокола)

Текст и метаданные идут в `LineEvent`. **Байты медиа** не обязаны ехать в том же кадре, что и событие: сначала договариваются о **идентичности blob** (`blob_id` + `sha256`), затем получатель **подкачивает байты** по приоритету источников.

### BlobRef

```ts
type BlobLocation =
  | {
      type: 'peer';
      node_id: NodeId;
      user_id?: UserId;
      /** опционально: caps для выбора транспорта (webrtc-dc, signaling-relay, lan, …) */
      caps?: string[];
    }
  | {
      type: 'server';
      url: string;
      expires_at?: number;
    };

type BlobRef = {
  blob_id: string;
  kind: 'image' | 'voice' | 'video_note' | 'video' | 'file';
  size_bytes: number;
  mime_type?: string;
  sha256: string;
  /** Порядок важен: клиент пробует источники сверху вниз. Список может **расти** за счёт peer-зеркал (см. «Peer-зеркала»). */
  locations: BlobLocation[];
};
```

**Правило по умолчанию для отправителя:**

1. После локальной записи файла считает `sha256`, формирует `blob_id` (например `sha256:` + hex или uuid при отложенном хеше).
2. В `message.create` кладёт `blob_refs` с **первым** элементом `{ type: 'peer', node_id: <свой текущий узел> }`, если готов раздавать этот blob по P2P.
3. **Вторым и далее** добавляет `{ type: 'server', url }`, когда upload на сервер завершён (или параллельно, если политика «сначала peer, потом докачать URL»).

**Правило для получателя:**

1. Принимает событие с `blob_refs`.
2. Идёт по `locations` по порядку: пробует P2P-получение до успеха или исчерпания списка.
3. Если peer недоступен / таймаут / отказ — переходит к следующему location (обычно `server` URL).
4. После загрузки проверяет **SHA-256** = `blob_ref.sha256`; при несовпадении событие blob считается недоступным или запрашивает другой источник.

Так **раздача медиа по P2P закреплена в протоколе**; сервер остаётся **обязательным запасным путём**, пока не доказана надёжность NAT/WebRTC для всех клиентов.

### Кадры передачи blob (один логический слой поверх существующего транспорта)

Транспорт может быть любым уже согласованным между узлами (отдельная WebRTC Data Channel сессия, расширение signaling relay, локальная сеть). Ниже — **семантика сообщений**, не привязка к Nest-событиям.

```ts
/** Автор объявляет: у меня есть blob с таким id и хешем; могу отдать. */
type BLOB_ANNOUNCE = {
  type: 'BLOB_ANNOUNCE';
  blob_id: string;
  sha256: string;
  size_bytes: number;
  mime_type?: string;
  chunk_size_bytes?: number; // рекомендуемый размер чанка, например 64 KiB
};

/** Получатель запрашивает байты (дозагрузка с offset для больших файлов). */
type BLOB_REQUEST = {
  type: 'BLOB_REQUEST';
  blob_id: string;
  sha256_expected: string;
  byte_offset: number;
  max_bytes: number;
};

/** Ответ куском данных (или ошибкой). */
type BLOB_CHUNK = {
  type: 'BLOB_CHUNK';
  blob_id: string;
  byte_offset: number;
  data_base64?: string; // или binary channel вне JSON — тогда размер в заголовке транспорта
  bytes_length: number;
  final: boolean;
};

type BLOB_TRANSFER_ERROR = {
  type: 'BLOB_TRANSFER_ERROR';
  blob_id: string;
  code: 'not_found' | 'refused' | 'timeout' | 'wrong_hash' | 'too_large';
  message?: string;
};
```

Для **огромных файлов** обязательны `byte_offset` / последовательные чанки / возможность **повторить** запрос с того же offset после обрыва.

### Личка 1:1

Естественный первый источник байтов — автор (`peer`), затем **server** URL. Других peer-зеркал обычно нет.

### Peer-зеркала (seeding) для **групп** и **каналов**

Идея: любой узел, который **уже проверил по `sha256`**, что локально хранит полный blob, может выступать **зеркалом** и помогать раздавать файл другим — как торрент-seed, но в рамках членства в line и проверки прав.

**Условия, чтобы узел мог объявить себя зеркалом:**

1. Локальный файл прошёл проверку **`sha256` == `BlobRef.sha256`**.
2. Для **группы**: `user_id` состоит в этой группе (для этого `line_id`).
3. Для **канала**: узел — **подписчик** (или выше), причём раздаёт только blob из **уже принятого и проверенного** события поста (подпись автора/админа валидна). Зеркалить «чужие» файлы без события нельзя.

**Как зеркала попадают в протокол**

- **Вариант A (простой):** при следующем обмене с пирами узел шлёт **дополнение** к известному событию: расширенный `BlobRef` или патч `locations` — добавляет в конец списка `{ type: 'peer', node_id: self, user_id }`. Получатели мержат уникальные `node_id`.
- **Вариант B (явные кадры):** отдельные сообщения без изменения события:

```ts
/** Узел сообщает: у меня локально есть полный blob (после verify sha256), могу раздавать. */
type BLOB_MIRROR_UP = {
  type: 'BLOB_MIRROR_UP';
  line_id: LineId;
  blob_id: string;
  sha256: string;
  node_id: NodeId;
  user_id: UserId;
  /** опционально: TTL объявления, чтобы не светиться вечно */
  expires_at?: number;
};

/** Отзыв зеркала (освободили место, удалили кеш). */
type BLOB_MIRROR_DOWN = {
  type: 'BLOB_MIRROR_DOWN';
  line_id: LineId;
  blob_id: string;
  node_id: NodeId;
};
```

Распространение `BLOB_MIRROR_UP` в группе: **gossip к участникам**, присоединение к чату, ответ на `LINE_PATCH_REQUEST`, или периодический слот в **LINE_SUMMARY** (компактный список «какие blob_id могу отдать» с ограничением размера).

В канале: подписчики после скачивания могут слать `BLOB_MIRROR_UP` **другим подписчикам** (тот же `line_id`), чтобы разгрузить сервер; новый подписчик сначала берёт метаданные с сервера, затем может запросить байты у ближайшего зеркала из списка.

**Выбор источника у получателя**

- После слия списков `locations` клиент может сортировать зеркала: **ближайший по сети**, случайный **редкий** выбор для баланса, или приоритет **server**, если P2P медленный.
- Лимиты: не более **N** параллельных попыток с разных peer; таймаут → следующий mirror или server.

**Безопасность**

- Доверять байтам можно только после **полной сборки и `sha256`**; подставить чужой файл «от имени» зеркала бессмысленно — хеш не сойдётся.
- Зеркало **не может** подменить текст поста: событие подписано автором; blob только приложение к нему.

### Оффлайн отправителя медиа

Пока нет сети, файл лежит локально, событие может быть создано с `blob_refs`, где пока только `peer` (свой узел) или пустой список до upload. После появления сети: **дозаполняется** `server` location после upload; получатели, которые успели взять только метаданные, догружают байты по приоритету.

### Реализация в продукте vs этот документ

В коде внедрение может идти по шагам (сначала URL-only, потом DC), но **контракт протокола** здесь уже включает **P2P blob + server fallback** как единую модель, без откладывания «на потом» в спецификации.

## Порядок и merge

Не полагаться только на `created_at`: часы устройств расходятся.

Рекомендуемый вариант для MVP:

1. `event_id` — stable uuid/hash.
2. `logical_clock` на устройстве автора.
3. `parent_event_ids` — какие головы line автор видел перед созданием события.
4. Отображение в UI: `created_at`, затем `logical_clock`, затем `event_id` как tie-breaker.
5. Сходимость: если два события параллельны, оба принимаются, порядок отображения детерминированный.

Это проще, чем полноценный CRDT, но уже лучше, чем один `last_message_id`.

## Минимальный сценарий: группа

1. Пользователь A написал сообщение локально: добавил `message.create` в line `group-1`.
2. A и B онлайн, обмениваются `LINE_SUMMARY`.
3. B видит, что у A есть незнакомая голова, шлёт `LINE_PATCH_REQUEST`.
4. A отдаёт `LINE_PATCH` с новым событием.
5. B проверяет подпись, членство автора в группе, сохраняет событие и отвечает `LINE_PATCH_ACK`.
6. **Медиа:** B качает blob по `locations` (автор → другие зеркала → server); после успешной проверки `sha256` B может отправить участникам **`BLOB_MIRROR_UP`** или дополнить известный `BlobRef` своим `node_id`.
7. Участник C позже может получить тот же файл с B или другого зеркала без нагрузки на сервер (если источники ещё онлайн).
8. Сервер/cache-node при следующем контакте тоже запрашивает `last_n` и держит хвост для офлайн-участников.

## Минимальный сценарий: канал

1. Owner или admin канала с `can_post` создаёт `message.create` с подписью.
2. Подписчики получают событие с сервера или от peer.
3. Каждый подписчик проверяет, что автор события — owner/admin с правом `can_post`.
4. Подписчики могут раздавать это событие другим подписчикам peer-assisted.
5. **Медиа:** первый надёжный источник байтов часто **server** URL; после полной загрузки подписчик шлёт **`BLOB_MIRROR_UP`** в gossip среди подписчиков того же `line_id`, чтобы другие качали с peer-зеркал.
6. Если онлайн-пиров нет, новый подписчик получает последние `N` постов с сервера/cache-node и медиа по URL.

## Рекомендация по внедрению

Не внедрять сразу полный LineSync. Самый безопасный порядок:

1. **Спецификация событий**: `message.create`, `message.edit`, `message.delete` и правила ACL.
2. **Локальный event-log в SQLite** поверх существующей таблицы сообщений или рядом с ней.
3. **Line summary / patch** только для private 1:1 или тестовой группы.
4. **Серверный cache-node**: последние `N` событий + TTL, без замены основного server path.
5. **P2P blob transfer**: кадры `BLOB_*` и проверка `sha256` — параллельно или сразу после стабильного text-patch для выбранного транспорта (DC vs signaling relay).
6. **Группы**: peer-assisted хвост событий + **peer-зеркала медиа** (`BLOB_MIRROR_UP` / merge `locations`), сервер остаётся fallback для blob URL и новых участников.
7. **Каналы**: валидные подписанные посты + **опциональный swarm подписчиков** для blob (зеркала только среди подписчиков); метаданные и минимальный хвост — с сервера.

## Что не делать в MVP реализации

- Не делать blockchain/consensus: для мессенджера достаточно подписанных событий и детерминированного merge.
- Не доверять "последнему id" без проверки цепочки/подписи.
- Не давать подписчикам канала создавать события постов.
- Не обещать, что **вся** медиа пойдёт только по P2P: до появления стабильного DC/TURN у части пользователей **server URL** в `BlobRef` остаётся обязательным запасом.
- Не обещать, что группы/каналы станут полностью без сервера: серверный cache-node нужен для UX нового участника, офлайна, модерации и восстановления.

## Implementation reference (first slice)

Ранний **кодовый каркас** (типы, структурные парсеры без крипто/подписи, ACL-хелперы под таблицу прав выше): `mobile/src/services/lineSyncProtocol.ts`, тесты: `npm run test:line-sync-protocol` в каталоге `mobile/`. Для групп в ACL используется поле `group_role` (`member` \| `admin` \| `owner`) вместе с `permissions.can_edit_others` / `can_delete_others`; в канале — `channel_role` и те же флаги для админов.

### Локальный event-log — что уже в коде (текущий срез)

- **Интеграция с отправкой:** в `mobile/src/screens/ChatScreen.tsx` при оптимистичной отправке **только текстовых** сообщений вызывается `buildPendingLineSyncRowFromOutgoingMessage` и запись в SQLite через `LineSyncEventDao.insert`. Другие типы (voice, media, file и т.д.) пока **не** дублируются в event-log.
- **Интеграция со входящими (только text):** в `mobile/src/contexts/WebSocketProvider.tsx` при подтверждённом приёме сообщения через `PeerDeliveryService.onDmDeliver`, `WebSocketService` `mailbox_deliver` и `new_message` вызывается `scheduleInboundTextLineSyncFromMappedMessage` → `buildPendingLineSyncRowForText` → `LineSyncEventDao.insert` (best-effort, дубликаты по `event_id` игнорируются). Сообщения, где **отправитель = текущий пользователь**, в этих путях **не логируются**, чтобы не плодить второе событие рядом с optimistic `msg:<tempId>` из чата server echo / mailbox для своих же сообщений. Если `currentUserId` ещё неизвестен, входящий event-log insert тоже пропускается до будущего backfill/remap.
- **Связка temp → server id (clean data):** первичный ключ события **остаётся** `event_id = msg:<client_temp_id>` (PK не переносим). В таблице добавлено nullable поле `server_message_id`: при `new_message` для **своего** исходящего текста, если пузырь сопоставлен по `client_temp_id`, после замены id в store вызывается `LineSyncEventDao.linkServerMessageIdForOptimisticTemp` (неблокирующе). Повторные вызовы идемпотентны (`already_linked`). Сопоставление **только** при матче по `client_temp_id`, не при эвристике `sending`; медиа/типы без optimistic LineSync-покрытия не трогаются. Если строки в логе нет (`missing`), предупреждение не шлётся; при конфликте уже записанного `server_message_id` — предупреждение в том же стиле, что и ошибки insert.
- **DAO** `mobile/src/db/dao/LineSyncEventDao.ts`: `insert` (идемпотентно, `INSERT OR IGNORE`, возвращает `boolean` — была ли вставлена строка), `getByEventId`, `getByLineId`, `getSinceCreatedAt` (анализ по времени `created_at`, не отдельный «cursor» типа), `getHeadsByLineId`, `markSyncState` (состояние синка по `event_id`; это соответствует раннему смыслу «applied`, но имя в коде именно `markSyncState`), **`linkServerMessageIdForOptimisticTemp`** (`linked` \| `already_linked` \| `missing` \| `conflict`).
- **Сборщик событий** `mobile/src/services/lineSyncEventBuilder.ts`: общий профиль сообщения `LineSyncMessageRowPick`; `buildMessageCreateEventFromOutgoingMessage` / `buildPendingLineSyncRowFromOutgoingMessage`; для входящего текста перед insert используется `buildPendingLineSyncRowForText` (возвращает `null`, если тип не text). `author_device_id` пока MVP-placeholder `local-mvp-device` даже для входящих, когда устройство автора неизвестно; не использовать его как trust-сигнал до реальных device id + signatures. Хелперы `message.edit` / `message.delete` в этом срезе отсутствуют.
- **Тест сборщика:** `npm run test:line-sync-event-builder`.
- **Серверный cache-tail:** добавлена таблица `line_sync_cache_events` и сервис `server/src/linesync/linesync-cache.service.ts`. После server message create/post создаётся `message.create` событие `msg:<server_message_id>` в отдельном хвосте LineSync. Хвост ограничивается `LINE_SYNC_TAIL_COUNT` (по умолчанию 10), а TTL берётся из `LINE_SYNC_TAIL_TTL_SECONDS` или падает обратно на `RELAY_TEXT_CACHE_SECONDS`. API/WS чтения хвоста ещё не подключены — это следующий этап.
- **Чтение cache-tail:** добавлен HTTP endpoint `GET /lines/:lineId/events/tail?limit=10` и WS-запрос `line_tail_request -> line_tail`. Сервер проверяет `chat_members` для текущего пользователя перед отдачей событий. На клиенте `mobile/src/services/LineSyncService.ts` умеет `fetchServerTail(lineId)` и идемпотентно складывает события в локальный `LineSyncEventDao`; malformed/чужие line события отклоняются.
- **Peer summary/patch MVP:** в `mobile/src/services/lineSyncProtocol.ts` добавлены типы/парсеры `LINE_SUMMARY`, `LINE_PATCH_REQUEST`, `LINE_PATCH`, `LINE_PATCH_ACK`; `LineSyncService` умеет строить summary из локальных heads, собирать patch из `LineSyncEventDao`, применять входящий patch без дублей и отвечать ack. Транспорт пока идёт через существующий signaling socket: `line_sync_send` на сервере пересылает `line_sync` целевому пользователю. Это ещё не WebRTC DataChannel и не включает ACL/crypto-проверки сверх структурной валидации.
- **Blob Event Log MVP:** upload на сервере считает реальный `sha256`, `media.sha256` сохраняется в PostgreSQL и передаётся клиентом в `send_message`. Для исходящих image/voice/video_note/video/file после успешного upload клиент пишет `message.create` с `blob_refs` и первой `server` location в локальный `line_sync_events`; для офлайнового replay hash также уходит на сервер. Серверный cache-tail добавляет `blob_refs` из сохранённых media. Локальный `MediaHashService` добавлен как будущий путь для peer-first media до upload; текущий MVP не записывает фейковые hash, если sha256 недоступен.
- **P2P Blob Mirrors MVP:** добавлены `BLOB_ANNOUNCE`, `BLOB_REQUEST`, `BLOB_CHUNK`, `BLOB_MIRROR_UP`, `BLOB_MIRROR_DOWN` парсеры. `LineSyncEventDao.mergeBlobPeerLocation` обогащает существующие `message.create.blob_refs.locations` peer-location по `blob_id + sha256`, не создавая нового события и не меняя тело сообщения. `LineSyncBlobService` слушает blob-сообщения поверх signaling `line_sync`, умеет объявлять mirror-up/down и принимать request/chunk callbacks. Реальная раздача байтов пока skeleton: chunk frames описаны, но локальное file pinning/serving ещё не подключено.

Имена методов **`getSinceCursor`** / **`markApplied`** встречаются ниже в дорожной карте этапов как черновик; в репозитории сейчас используйте **`getSinceCreatedAt`** и **`markSyncState`**.

---

### Дорожная карта этапов (часть шагов ещё не реализована в коде)

Этап 1 — Локальный Event Log
Цель: каждое исходящее/входящее сообщение получает событие message.create, которое можно потом сверять через LineSync.

Файлы:

mobile/src/db/schema.ts
Добавить таблицу line_sync_events: event_id, line_id, event_type, payload_json, author_user_id, created_at, logical_clock, signature, sync_state.
mobile/src/db/types.ts
Добавить тип LineSyncEventRow.
mobile/src/db/dao/LineSyncEventDao.ts
Методы (как в текущей реализации): insert → boolean, getByEventId, getByLineId, getSinceCreatedAt, getHeadsByLineId, markSyncState.
mobile/src/services/lineSyncEventBuilder.ts
Функции: buildMessageCreateEventFromOutgoingMessage(...), buildPendingLineSyncRowFromOutgoingMessage(...); далее по плану — buildMessageEditEvent(...), buildMessageDeleteEvent(...).
mobile/src/services/lineSyncProtocol.test.ts или новый lineSyncEventBuilder.test.ts
Проверить, что message.create строится стабильно и проходит parseMessageCreateEvent.
Этап 2 — Интеграция Event Log с текущей отправкой
Цель: текущие сообщения остаются как есть, но параллельно пишем протокольное событие.

Файлы:

mobile/src/screens/ChatScreen.tsx
После создания optimistic **text** message вызвать builder и сохранить event-log (расширение на voice/image/video — следующими шагами).
mobile/src/services/TransportService.ts
При успешном p2p обновлять событие как applied/local_sent; при server fallback не создавать второе событие, только связать server id.
mobile/src/contexts/WebSocketProvider.tsx
При входящем dm_deliver, mailbox_deliver, new_message писать message.create в event-log, если такого event_id ещё нет.
mobile/src/services/SyncService.ts
При offline replay не дублировать event-log, а использовать уже созданный event по tempId.
Этап 3 — Серверный Cache-Node Tail
Цель: сервер держит чистый хвост событий LineSync, например последние 10/TTL, отдельно от полной message-модели.

Файлы:

server/prisma/schema.prisma
Добавить LineSyncEvent или LineCacheEvent: eventId, lineId, eventType, payloadJson, createdAt, expiresAt.
server/prisma/migrations/.../migration.sql
Таблица + индексы line_id, expires_at, (line_id, created_at).
server/src/linesync/linesync-cache.service.ts
Методы: upsertEvent, getTail(lineId, limit), pruneExpired.
server/src/linesync/linesync.module.ts
server/src/app.module.ts
Подключить модуль.
server/src/messages/messages.service.ts
После server fallback/message create писать message.create event в cache-tail.
server/src/channels/channels.service.ts
При посте канала писать event в cache-tail.
server/src/config/relay-policy.config.ts
Добавить policy для LINE_SYNC_TAIL_COUNT и LINE_SYNC_TAIL_TTL_SECONDS или переиспользовать RELAY_*.
Этап 4 — API/WS для чтения хвоста
Цель: новый клиент может получить последние N событий, если пиров нет.

Файлы:

server/src/linesync/linesync.controller.ts
GET /lines/:lineId/events/tail?limit=10
server/src/linesync/linesync.gateway.ts или существующий websocket.gateway.ts
Event: line_tail_request → line_tail.
server/src/auth/guards/... / membership helper
Проверять, что пользователь имеет доступ к lineId.
mobile/src/services/LineSyncService.ts
Метод fetchServerTail(lineId) и применение событий в локальный event-log.
Этап 5 — Peer Summary / Patch поверх текущего signaling
Цель: когда peer онлайн, сверять события напрямую, но уже поверх чистого event-log.

Файлы:

mobile/src/services/lineSyncProtocol.ts
Добавить типы/парсеры: LINE_SUMMARY, LINE_PATCH_REQUEST, LINE_PATCH, LINE_PATCH_ACK.
mobile/src/services/LineSyncService.ts
Обработка summary/patch, чтение из LineSyncEventDao.
mobile/src/services/PeerDeliveryService.ts или SignalingService.ts
Проброс raw событий LineSync по signaling socket.
mobile/src/contexts/WebSocketProvider.tsx
При открытии чата или dm_deliver запускать sync handshake для line.
mobile/src/services/lineSyncProtocol.test.ts
Тесты summary/patch + reject malformed.
Этап 6 — Blob Event Log, без P2P байтов пока
Цель: подготовить чистые данные для медиа, не ломая upload.

Файлы:

mobile/src/services/lineSyncEventBuilder.ts
blob_refs для медиа: sha256, size_bytes, locations.
mobile/src/services/MediaHashService.ts
Считать sha256 локального файла.
mobile/src/services/TransportService.ts
После upload добавлять server location в event-log.
server/src/linesync/linesync-cache.service.ts
Хранить blob metadata в event payload.
Этап 7 — P2P Blob Mirrors
Цель: кто скачал медиа — может стать зеркалом.

Файлы:

mobile/src/services/LineSyncBlobService.ts
BLOB_ANNOUNCE, BLOB_REQUEST, BLOB_CHUNK, BLOB_MIRROR_UP/DOWN.
mobile/src/services/lineSyncProtocol.ts
Парсеры для BLOB_*.
mobile/src/services/LineSyncService.ts
Merge peer locations в BlobRef.
mobile/src/db/dao/LineSyncEventDao.ts
Обновление locations без изменения исходного message.create.
server/src/linesync/linesync-cache.service.ts
По желанию хранить mirror announcements с TTL.

Статус подключения blob bytes:

- `mobile/src/services/LineSyncBlobService.ts` уже умеет pin-ить локальный файл как mirror по `blob_id = sha256:<hash>`, проверяя SHA-256 перед записью.
- После успешной отправки медиа `mobile/src/services/TransportService.ts` добавляет исходный локальный файл в media cache, поэтому автор сообщения сразу может отвечать на `BLOB_REQUEST`.
- Входящий `BLOB_REQUEST` обслуживается из локального `MediaCacheService`: файл читается как base64 и отправляется набором `BLOB_CHUNK`.
- Получатель может вызвать `requestBlobAndWait(...)`: сервис соберёт chunks, запишет файл в cache, проверит SHA-256 и добавит себя как peer mirror в `blob_refs.locations`.
- Для обычного сценария добавлен `requestBlobFromKnownMirror(lineId, blobId)`: он берёт peer location из локального event-log и сам запрашивает blob у подходящего пира.
- Следующий шаг подключён: `mobile/src/services/LineSyncDataChannelService.ts` поднимает отдельный WebRTC DataChannel `linesync-blobs` через signaling события `line_sync_dc_offer`, `line_sync_dc_answer`, `line_sync_dc_ice`.
- `BLOB_REQUEST`, `BLOB_CHUNK`, `BLOB_MIRROR_UP` и `BLOB_MIRROR_DOWN` сначала пробуют идти через DataChannel; если канал не открылся или закрыт, остаётся fallback на signaling WebSocket chunks.
- UI слой peer-first подключён через `mobile/src/services/LineSyncMediaResolver.ts` и компоненты `mobile/src/components/peerFirstMedia.tsx`: основной чат (`ChatScreen`, `ChatMessageList`), лента и обсуждение канала (`ChannelFeedScreen`, `ChannelDiscussionScreen`), превью ответов (`ReplyPreview`, `InputBar`, `ChatInputDock`), профиль чата и галерея (`ChatProfileScreen`, `ChatProfileMediaSection`), профиль канала (`ChannelProfileScreen`). Баблы медиа сначала пытаются получить локальный peer blob по LineSync event-log; при неудаче используют обычный server URL.
- Для сообщений, где UI знает только `remote_url`, resolver ищет `BlobRef` по server location внутри локального LineSync event-log, затем вызывает `requestBlobFromKnownMirror(lineId, blobId)`.

### Оставшиеся шаги (продукт и техника)

Ниже — что ещё нужно относительно **целевой модели минимального сервера** (раздел выше) и зрелости peer-слоя.

#### 1. Согласовать транспорт текста с целевой моделью

Спецификация исходящего пути и трёх слоёв данных для лички — в разделе **«Этап B (личка): запись в `messages`, LineSync и на сервере»** выше. Успешный **P2P-only** текст уже **не** вызывает `send_message`, поэтому серверная строка из этого отправления не появляется; fallback и офлайн по-прежнему идут через **`send_message` + `relay_mailbox`**. Дальше по плану B2–B4: явная семантика транспорта в UI, полировка fallback и отсутствие дублей при слиянии с серверным ACK.

Для **групп** отдельно остаётся **retention только последних N** и добор истории с пиров — это этап C и миграции сервера, не только UI.

#### 2. Синхронизация метаданных до попытки peer

Чтобы `requestBlobFromKnownMirror` стабильно работал, на устройстве должны быть актуальные `blob_refs` и peer locations:

- при открытии линии / появлении собеседника онлайн — **LineSync summary/patch** и при необходимости **server tail** (`fetchServerTail` / `requestServerTailOverWebSocket`), чтобы локальный event-log не был пустым;
- после создания медиа на сервере — все пути (WS, sync queue, mailbox) должны давать клиенту данные, достаточные для поиска blob по URL.

#### 3. UX для больших файлов и долгих попыток

Таймаут и fallback на сервер частично есть в resolver; для продукта обычно дополнительно:

- явная индикация источника / прогресса;
- отмена и повтор.

#### 4. Надёжность сети и WebRTC (DataChannel)

Путь DataChannel — MVP: TURN из конфига подключён; остаётся довести **переподключение** при смене сети / фоне, лимиты размера и стратегию чанков для очень больших файлов.

#### 5. Политика выбора mirror и нагрузка на UI

Сделано частично: предпочтение peer с открытым DC, распределение по хэшу от `blobId`, дедуп параллельных resolve в `LineSyncMediaResolver`. Дальше по желанию: латентность / health peer’ов.

#### 6. Безопасность и целостность

SHA-256 на приёме blob; ACL на входящий `BLOB_REQUEST` (membership, `findBlobRef`, сверка `requester_user_id` с транспортом) — в коде. Для продакшена возможны rate limits и расширенная наблюдаемость отказов.

#### 7. Наблюдаемость и тесты

Счётчики peer-first и DC в `LineSyncTelemetry` (в т.ч. снапшот для отладки). Автотесты на полный сценарий resolver «mirror → локальный uri → нет mirror → HTTP» — по желанию следующий шаг.
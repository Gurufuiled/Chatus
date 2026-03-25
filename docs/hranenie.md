# Переход на P2P и decentralized storage

## Зачем обновляем эту заметку

С момента первых заметок мессенджер сильно вырос. Сейчас у нас уже есть:

- текстовые сообщения;
- reply, в том числе reply по свайпу;
- forward;
- delete message;
- server-backed pin сообщения в чате;
- медиа-сообщения: `image`, `voice`, `file`, `video_note`;
- voice playback: waveform, seek, скорости `1x / 1.5x / 2x`, верхняя voice-плашка;
- профиль собеседника с вкладками `Медиа / Файлы / Голосовые / Ссылки`;
- поиск по чату;
- unread badge в списке чатов;
- long-press меню чата в списке: `закрепить`, `отключить уведомления`, `удалить чат`;
- локальная блокировка пользователя;
- in-app audio calls;
- presence и typing.

Из-за этого перенос на P2P уже нельзя обсуждать только на уровне "как доставить текст". Нужно понимать, какие функции:

- уже хорошо ложатся на P2P;
- требуют событийной модели;
- должны остаться purely local;
- а где понадобится mailbox / relay / hybrid blob layer.

## Текущая картина

Сейчас архитектура по смыслу такая:

- сервер хранит общий state чатов, сообщений, профилей и call signaling;
- мобильный клиент хранит локальную копию в SQLite и локальных store;
- realtime в основном идет через WebSocket;
- медиа сейчас серверно-центричны: файл загружается на backend и потом раздается по `remote_url`;
- часть пользовательских действий уже локальна и не зависит от сервера, например `mute chat`, `pin chat` в списке чатов, локальный `block`, локальное удаление чата у себя.

Это значит, что у нас уже есть хорошая база для hybrid-модели:

- история и UI умеют жить локально;
- но канонический источник истины по многим функциям пока серверный.

## Базовый принцип для P2P

Если функция сейчас живет как поле на сервере и сервер считается каноническим источником истины, то в P2P ее обычно лучше переосмыслить как одно из четырех:

1. message event;
2. chat-state event;
3. user/device-local state;
4. derived view поверх локально синкнутой истории.

Практически это выглядит так:

- текст, reply, forward, delete естественно ложатся в message/event log;
- pin сообщения, read cursors и membership-состояния лучше превращать в chat-state events;
- mute чата, pin чата в списке, block пользователя чаще всего user-local state;
- поиск, вкладки `Медиа / Файлы / Голосовые / Ссылки`, jump-to-message и voice waveform preview чаще всего derived view.

## Что уже хорошо переносится на P2P

### 1. Обычные текстовые сообщения

Текст уже является нормальным message event.

Для P2P здесь нужен только стандартный набор:

- стабильный `message_id`;
- порядок сообщений или правило разрешения конфликтов;
- синк пропущенной истории;
- локальное хранение в SQLite;
- mailbox как fallback для офлайна.

### 2. Reply

`reply_to_id` уже выглядит как ссылка на другое сообщение.

Для P2P reply остается обычным сообщением с ссылкой на origin. Если origin пока не догружен локально, можно временно показывать degraded preview.

То есть сам reply уже P2P-friendly.

### 3. Forward

Forward лучше мыслить не как "серверную команду", а как новое сообщение с metadata.

Возможны три модели:

- copy-forward;
- `forwarded_from`;
- hybrid: payload копируется, но trace origin сохраняется.

Главный вопрос тут не transport, а продуктовая семантика.

### 4. Delete message

Delete хорошо переносится как отдельное событие:

- `message_deleted`;
- или tombstone поверх message log.

Это лучше, чем держать delete как "сервер переписал строку в базе". Тогда разные peers могут прийти к одному и тому же состоянию через sync.

### 5. Derived-функции поверх истории

Сюда относятся:

- поиск по чату;
- профильные вкладки `Медиа / Файлы / Голосовые / Ссылки`;
- jump-to-message;
- pinned preview в UI;
- waveform preview и voice UI.

Это не отдельные P2P-проблемы. Это derived view из уже синкнутой локальной истории.

Если локальная история синкается хорошо, эти функции почти автоматически продолжают работать.

## Что переносится, но требует отдельной модели

### 6. Media messages: image, voice, file, video note

Message layer переносится нормально:

- `msg_type`;
- metadata;
- размеры;
- waveform;
- file name / file size;
- preview metadata.

Сложность начинается на blob layer:

- сам файл;
- thumbnail;
- локальный кэш;
- retry;
- недоступный offline peer.

Для P2P здесь нужен отдельный слой доставки и хранения:

- direct peer-to-peer transfer;
- локальный media cache;
- mailbox для metadata и маленьких вложений;
- relay / hybrid blob transport для больших файлов.

Итог:

- metadata переносится хорошо;
- хранение и доставка blob-ов требуют отдельной архитектуры.

### 7. Read / delivered / unread

Сейчас unread badge у нас уже есть, но в текущем виде это не финальная P2P-модель.

Для P2P правильнее мыслить это как:

- `delivered_up_to`;
- `read_up_to`;
- per-device receive marker;
- derived unread count.

То есть не "одно число на сервере", а read cursor или read events.

Это важно еще и потому, что unread почти всегда:

- разный у разных пользователей;
- может различаться между устройствами одного пользователя;
- не должен быть глобальным полем общего chat state.

### 8. Presence и typing

Presence и typing плохо подходят для постоянного хранения.

Это ephemeral state:

- `online / offline`;
- `last seen`;
- `is typing`.

В P2P это скорее live-события:

- heartbeat;
- `typing_started`;
- `typing_stopped`;
- TTL и auto-expire.

Mailbox здесь полезен ограниченно: offline-presence уже неактуален, а typing вообще теряет смысл.

### 9. Search

Поиск по чату переносится легко, но как локальная функция.

Правильная модель:

- локальный индекс;
- поиск по уже синкнутой локальной истории;
- без зависимости от централизованного full-text сервера.

Ограничение простое: если история еще не догружена, поиск будет неполным.

### 10. Профиль пользователя

Сейчас профиль опирается на server-backed `GET /users/:id`.

В P2P профиль лучше мыслить как:

- signed profile document;
- локально кэшируемую карточку пользователя;
- набор profile-update событий.

Что переносится хорошо:

- display name;
- avatar reference;
- handle / username;
- bio;
- телефон или email, если продукт вообще хочет это показывать.

Что нужно переосмыслить:

- кто источник истины профиля;
- как доверять обновлениям профиля;
- как синкать профиль между несколькими устройствами пользователя.

## Что в текущем виде не является финальной P2P-моделью

### 11. Pin сообщения в чате

Сейчас pin у нас server-backed через `pinned_message_id` в чате.

Для MVP это удобно:

- сервер хранит текущее состояние;
- сервер рассылает обновление;
- клиенты просто синкаются.

Но для P2P финальнее выглядит одна из моделей:

- локальный pin только для пользователя;
- shared pin как chat-state event `pin_message` / `unpin_message`;
- event-sourced chat state, где текущий pin вычисляется из последнего валидного события.

То есть текущее поле `pinned_message_id` хорошо для server-backed этапа, но не как окончательная P2P-модель.

### 12. Mute chat / pin chat в списке чатов

Сейчас эти функции у нас локальные, и это на самом деле правильно.

Для P2P здесь две нормальные модели:

- purely local user preference;
- per-user synced preference только между собственными устройствами пользователя.

То есть:

- `mute chat` почти точно не должен быть общим состоянием чата;
- `pin chat` в списке тоже почти всегда user-local view preference.

### 13. Delete chat

Удаление чата надо разделять на два разных смысла:

- `удалить у меня` — локально скрыть или убрать диалог;
- `удалить у всех` — уже другое продуктовое действие.

Для P2P:

- локальное удаление чата остается purely local;
- delete-for-both требует отдельной модели membership / tombstone / policy.

То есть "удалить чат" и "удалить сообщение у всех" — это не одно и то же.

### 14. Block пользователя

Сейчас block у нас локальный, и это тоже нормально ложится в P2P.

Block обычно лучше оставлять как:

- локальную политику пользователя;
- или preference, синкаемую только между устройствами самого пользователя.

Не нужно превращать block в общий state чата.

### 15. In-app audio calls

Сейчас звонки у нас app-level и держатся на серверном signaling:

- offer / answer / ice candidate;
- `call_cancel`;
- `call_decline`;
- `call_end`;
- `call_busy`.

В P2P реальный audio stream действительно может идти peer-to-peer, но signaling почти всегда все равно требует:

- хотя бы relay-сервисы;
- NAT traversal;
- а на практике часто еще TURN-подобный fallback.

То есть calls могут быть P2P по медиапотоку, но signaling и connectivity help чаще всего остаются hybrid.

## Разбор по уже добавленным функциям мессенджера

### Reply и reply swipe

Переносятся хорошо. Это обычный message event + ссылка на origin.

### Forward

Переносится хорошо как новое сообщение с metadata.

### Delete message

Переносится хорошо как tombstone / delete event.

### Voice playback: waveform, seek, speed, top voice banner

Это в основном UI и local playback logic. Сама сложность не в UI, а в том, чтобы у клиента был media blob или стабильный доступ к нему.

### Профильные вкладки `Медиа / Файлы / Голосовые / Ссылки`

Это derived view из локальной истории. Отдельной P2P-доставки для вкладок не нужно.

### Поиск из профиля и поиск по чату

Это локальный индекс поверх локальной истории, а не функция централизованного сервера.

### Unread badge

Должен стать derived view из `read_up_to`, а не глобальным полем чата.

### Mute / pin / delete chat в списке чатов

Это в основном per-user local state. Максимум — sync между собственными устройствами пользователя.

### Local block

Хорошо остается локальной политикой.

### Presence и typing

Это ephemeral live state, а не постоянное хранилище.

### Calls

Самый реалистичный вариант для нас — hybrid:

- peer-to-peer media, где это возможно;
- relay/TURN-like fallback для сложных сетей;
- signaling или mailbox-подобный механизм для call intents и missed-state.

## Mailbox как компромиссный слой

Под `mailbox` здесь имеется в виду не "обычный сервер мессенджера", а временный store-and-forward слой для офлайн-доставки.

Идея такая:

- direct P2P остается основным способом доставки;
- если peer offline, зашифрованное событие временно складывается в mailbox;
- когда peer снова online, он забирает накопившееся;
- после подтверждения mailbox может удалить локальную копию.

То есть mailbox нужен не как источник истины чата, а как временный буфер доставки.

### Чем mailbox нам подходит

- сохраняет P2P-first идею;
- сильно улучшает offline UX;
- особенно полезен для текста, reply, forward, delete и chat-state events;
- дает реалистичную модель "сообщение не потерялось, пока peer был offline".

### Чем mailbox не является

- это не глобальная каноническая база чата;
- это не вечное хранилище медиа;
- это не замена локальной истории на устройстве.

### Где mailbox особенно хорош

- текстовые сообщения;
- reply / forward;
- delete / pin / unpin как события;
- read-события;
- небольшие вложения или metadata медиа;
- call-intents и missed-state.

### Где уже нужны дополнительные решения

- большие фото и видео;
- тяжелые файлы;
- долгий офлайн;
- медиаконтент, который должен быть доступен не только пока один peer в сети.

Здесь уже понадобится либо relay/blob layer, либо hybrid media architecture.

## Как лучше разделить будущее состояние

### Message events

Сюда хорошо ложатся:

- text;
- reply;
- forward;
- image / voice / file / video_note metadata;
- delete message;
- при желании reactions, если они появятся позже.

### Chat-state events

Сюда лучше переносить:

- pin / unpin сообщения;
- membership-изменения;
- read cursors;
- delivered cursors;
- возможно некоторые shared moderation actions.

### User-local state

Сюда хорошо ложатся:

- mute chat;
- pin chat в списке;
- block user;
- локальное удаление чата;
- визуальные preferences и layout-state.

### Derived views

Сюда относятся:

- поиск;
- профильные вкладки контента;
- unread badge как производное от read cursor;
- voice preview UI;
- jump-to-message.

## Реалистичный поэтапный план переноса

### Этап 1. Текст и базовые message events

- text;
- reply;
- forward;
- delete как tombstone;
- локальное хранение в SQLite;
- mailbox для офлайн-доставки текста.

### Этап 2. Chat-state events

- pin / unpin сообщения;
- read / delivered cursors;
- базовый sync состояния чата между peers.

### Этап 3. User-local state

- mute chat;
- pin chat в списке;
- local block;
- delete chat у себя;
- sync этих preferences только между собственными устройствами пользователя при необходимости.

### Этап 4. Media transport

- metadata уже в message log;
- маленькие вложения и metadata можно временно держать через mailbox;
- для больших blob-ов нужен отдельный relay / hybrid media layer.

### Этап 5. Presence, typing, calls

- presence и typing как ephemeral live events;
- calls как hybrid flow: signaling + relay help + peer media, где возможно.

## Короткий итог

Сейчас наш мессенджер уже достаточно зрелый, чтобы обсуждать P2P не абстрактно, а по слоям.

Главный вывод такой:

- text, reply, forward и delete уже хорошо подходят для P2P;
- profile tabs, search и voice UI почти полностью derived from local history;
- pin сообщения, read/unread и часть chat state надо переносить из "поля на сервере" в событийную модель;
- mute, pin чата в списке, block и локальное удаление чата логичнее оставить user-local;
- медиа и звонки не упираются только в message layer, им нужен отдельный transport/storage strategy;
- mailbox для нас выглядит самым реалистичным компромиссом между чистым direct P2P и нормальным offline UX.

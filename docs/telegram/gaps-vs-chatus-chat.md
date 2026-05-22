# Пробелы Telegram-чата относительно Chatus-чата

Сравнение **нативного чата** (`ChatScreen`, сервер Chatus) и **Telegram-ветки** (`TelegramChatScreen`, TDLib). Отдельно отмечено, что критично именно для **канала** (`chatType: 'channel'`).

---

## 1. Что уже есть в Telegram (в т.ч. в канале)

| Область | Статус | Где в коде |
|---------|--------|------------|
| История, pull-to-refresh, догрузка | ✅ | `TelegramChatScreen`, `loadHistory` |
| Текст, фото, видео, голос, кружок, файл | ✅ | `tdlibMapping`, рендер в `TelegramChatScreen` |
| Отправка через `InputBar` (одно медиа за раз) | ✅ | `sendMedia`, `sendFile`, `sendVoice`, … |
| Reply (меню + swipe) | ✅ | `useTelegramChatMenu`, `ReplySwipeWrapper` |
| Forward, batch select/delete | ✅ | `TelegramForwardSheet`, selection mode |
| Pin / unpin (TDLib) | ✅ | `tdlibPinChatMessage` в меню |
| Реакции (выбор в overlay меню) | ✅ | `handleTelegramPickReaction` |
| Обсуждение под постом канала | ✅ | `TelegramChannelCommentsBar`, `handleOpenDiscussion` |
| Просмотры поста | ✅ | `viewCount` в строке |
| Read-only для подписчика / `canPost` | ✅ | `canPost`, `readOnlyFooter` |
| Тема фона (глобально на чат) | ✅ | `uiStore` + `ChatBackgroundPattern` |
| Кэш сообщений, preload соседних чатов | ✅ | `telegramMessageCache`, `telegramChatPreload` |
| Профиль TG-чата | ✅ | `TelegramChatProfileScreen` (mute, обои, медиа, leave) |
| Interactive back (Android) | ✅ | `InteractiveChatBackShell` |
| Crop фото в галерее при отправке | ✅ | общий `InputBar` + `GalleryPhotoPreview` |
| Рисование на фото перед отправкой | ❌ нигде (Chatus и TG) | см. §2.7, `gallery_editor_plan.md` |

---

## 2. Чего нет или реализовано слабо (общий Telegram-чат)

### 2.1 Поиск и навигация по ленте

| В Chatus | В Telegram |
|----------|------------|
| In-chat search: поле, подсветка, счётчик совпадений, переход по match | ❌ Нет UI поиска в `TelegramChatScreen` |
| Из профиля: `startSearch: true` → сразу режим поиска | ⚠️ `TelegramChatProfileScreen.handleSearchPress` только открывает чат **без** параметра поиска |

**Файлы:** `ChatScreen.tsx` (`isSearchMode`, `ChatTopBanners`), `TelegramChatProfileScreen.tsx` (~470).

---

### 2.2 Закреплённое сообщение (баннер)

| В Chatus | В Telegram |
|----------|------------|
| `ChatTopBanners`: текст закрепа, тап → скролл, крестик → открепить | ❌ `pinnedMessageId` хранится и pin в меню работает, **баннера нет** |

**Файлы:** `ChatTopBanners.tsx`, `TelegramChatScreen.tsx` (state без UI).

---

### 2.3 Альбомы (несколько фото одним сообщением)

| В Chatus | В Telegram |
|----------|------------|
| Отправка: `onSendMediaAlbum` / `handleSendMediaAlbum` | ❌ Только `sendMedia` на одно фото/видео |
| Отображение: сетка альбома в `ChatMessageList` | ❌ В `TelegramMessageKind` нет `album`; grouped media из TDLib не маппятся |

**Файлы:** `ChatScreen.tsx`, `InputBar.tsx`, `tdlibMapping.ts`, `types.ts`.

---

### 2.4 Стикеры и расширенные типы TDLib

| В Chatus | В Telegram |
|----------|------------|
| Chatus-стикеры в композере (`chatusStickersComposer`) | ❌ Не передаётся в `InputBar` на TG-экране |
| Composite / solo стикеры в ленте | ❌ |
| Telegram `messageSticker` в чате | ❌ Только заглушка в превью диалога (`previewForUnsupported`) |
| Опросы, GIF, локация, контакт, dice и др. | ❌ Падают в `kind: 'service'` / текст-заглушка |

**Файлы:** `tdlibMapping.ts` (kinds: text, voice, image, video, video_note, file, service), `composer.ts`.

---

### 2.5 Реакции и «социальный» UX ленты

| В Chatus | В Telegram |
|----------|------------|
| Inline-реакции на пузыре (`allowReactions`, `onToggleReaction`) | ❌ Только через long-press → overlay |
| Баннер «сейчас играет» голос / кружок при скролле | ❌ Нет `ChatTopBanners` |

---

### 2.6 Оформление чата из экрана переписки

| В Chatus | В Telegram |
|----------|------------|
| `ChatThemePickerModal` из чата / `openThemePicker` | ❌ Тема меняется через профиль / store, без picker на экране чата |

---

### 2.7 Галерея / редактор медиа (общий `InputBar`, не пробел TG)

Редактор в шторке галереи **один** для Chatus-чата и Telegram-чата (`InputAttachmentSheet` → `GalleryPhotoPreview`). Сравнение «Chatus vs Telegram» здесь **не применимо** — оба контура используют один код.

| Функция | Chatus-чат | Telegram-чат | План |
|---------|------------|----------------|------|
| Превью, мульти-выбор, подпись | ✅ | ✅ | `gallery_editor_plan.md` |
| Обрезка (crop) | ✅ | ✅ | фазы 1–3 |
| **Рисование на фото** | ❌ **ещё нет** | ❌ **ещё нет** | фазы 4–5, `DrawingCanvas` в коде нет |
| Поворот / flip в crop | ❌ | ❌ | в плане |

**Важно:** рисование **не считать** отставанием Telegram-канала от Chatus — в нативном чатусе оно тоже не сделано.

---

### 2.8 Платформа и шапка

| В Chatus | В Telegram |
|----------|------------|
| Android: тап по заголовку → профиль (личка/группа) | ⚠️ **Канал и супергруппа:** `CustomAndroidChatHeader` с `peerId: null` — **профиль из шапки не открывается** (на iOS — через `useLayoutEffect` → `TelegramChatProfile`) |

**Файлы:** `TelegramChatScreen.tsx` (~1877), `CustomAndroidChatHeader.tsx`.

---

### 2.9 Статусы исходящих

| В Chatus | В Telegram |
|----------|------------|
| Доставка / прочтение в `MessageTimeStatus` | ⚠️ Упрощённо; см. [telegram-chat-ui-parity.md](../tasks/telegram-chat-ui-parity.md) фаза A |

---

### 2.10 Звонки и серверные фичи Chatus

| Функция | В Telegram |
|---------|------------|
| WebRTC-звонки (`CallContext`, профиль Chatus) | ❌ Заглушка в `TelegramChatProfileScreen` |
| Offline-first, LineSync, очередь SQLite | ❌ Другой стек (TDLib) — **не цель паритета** |
| Скрытие чужого сообщения только у себя | ❌ Нет в TG-меню |
| Редактирование отправленного текста | ❌ В обоих UI не выделено |

---

## 3. Специфика Telegram-канала

Поведение, которое **уже отличается** от лички (и это норма Telegram):

- Входящие посты: широкая карточка (`channelIncomingWrap`), без «группового» аватара автора поста.
- Подписчик без прав: композер скрыт (`Только для чтения`).
- Админ с `canPost`: тот же `InputBar`, что в обычном TG-чате.
- Footer обсуждения и переход в linked discussion chat.

### 3.1 Пробелы канала (поверх общих)

| # | Пробел | Заметка |
|---|--------|---------|
| 1 | Поиск по постам канала | Как в п. 2.1 |
| 2 | Баннер закреплённого поста | Как в п. 2.2 — для каналов с pin особенно заметно |
| 3 | Альбом в посте (входящий/исходящий) | Как в п. 2.3 — типичный формат каналов |
| 4 | Android: профиль канала из шапки | Как в п. 2.8 |
| 5 | Reply на чужой пост подписчиком | В TG обычно нельзя; в коде swipe-reply **не отключён** для `channelIncoming` — стоит явно ограничить reply/swipe для входящих постов, оставить админу с `canPost` |
| 6 | Telegram-стикеры в постах канала | Не рендерятся (п. 2.4) |
| 7 | Inline-реакции на постах | Нет (п. 2.5) |
| 8 | Chatus-стикеры при публикации поста | Нет (п. 2.4) |

---

## 4. Сравнение с каналом Chatus на сервере (`ChannelFeedScreen`)

Если цель — один UX «канала» в приложении, дополнительные расхождения:

| Есть в Chatus-канале (сервер) | Нет в Telegram-канале (TDLib) |
|------------------------------|------------------------------|
| Альбомы в ленте и при публикации | Одно медиа, нет album send/render |
| Стикеры в композере постов | Нет |
| Настройки комментариев (off для старых/новых постов) | Только поведение TG + linked discussion |
| Свои счётчики просмотров/комментариев API | TDLib `viewCount` + `discussionReplyCount` (есть) |

---

## 5. Чеклист закрытия пробелов

Использовать как living document; при реализации — ставить `[x]`.

### P0 — заметно в канале каждый день

- [x] In-chat search в `TelegramChatScreen` (+ `startSearch` из профиля, иконка в шапке iOS)
- [x] `ChatTopBanners` для закреплённого (превью, скролл, unpin через TDLib)
- [x] Android: шапка канала/супергруппы/лички → `TelegramChatProfile` (`onTitlePress`)

### P1 — паритет с `ChatScreen`

- [x] Отправка альбома (`sendMessageAlbum` + `onSendMediaAlbum` в `TelegramChatScreen`)
- [x] Отображение grouped / album incoming (`media_album_id` → `collapseTelegramAlbumRows`)
- [ ] Рендер `messageSticker` и базовых unsupported types
- [ ] Inline-реакции на пузыре
- [ ] Баннеры voice / video note
- [ ] `ChatThemePickerModal` из экрана чата
- [ ] Ограничение reply/swipe для входящих постов канала (продуктовое правило)

### P2 — общий редактор галереи и второстепенное

*(не «догнать Telegram», а закрыть `gallery_editor_plan` для всего приложения)*

- [ ] Рисование на фото — **Chatus + Telegram** (`gallery_editor_plan` фазы 4–5)
- [ ] Поворот/flip в crop — **Chatus + Telegram**
- [ ] Chatus-стикеры в TG (опционально, только исходящие / админ)
- [ ] Скрытие сообщения только у себя
- [ ] Статусы исходящих TDLib (фаза A из tasks)

### P3 — вне scope TDLib-канала

- [ ] WebRTC в Telegram-ветке (не планируется — нативный Telegram)
- [ ] LineSync / server mailbox в TG-чате

---

## 6. Связанные документы

- [roadmap-priority.md](./roadmap-priority.md) — порядок спринтов
- [../tasks/telegram-chat-ui-parity.md](../tasks/telegram-chat-ui-parity.md) — фазы A–G (статусы, композер, типы контента)
- [../../gallery_editor_plan.md](../../gallery_editor_plan.md) — галерея и редактор (общий для Chatus и TG; crop ✅, рисование ❌ везде)

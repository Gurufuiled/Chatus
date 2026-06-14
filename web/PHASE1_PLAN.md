# ChatUs Web — план фазы 1

**Статус:** план для реализации  
**Язык реализации:** React + Vite + TypeScript  
**Контекст:** веб-версия ChatUs встраивается в Loginus как embedded app в iframe (`/embed`)  
**Опорные документы:** `web/STACK.md`, `web/EMBED.md`

---

## 1. Цель фазы 1

Собрать первый рабочий веб-клиент ChatUs для Loginus: Telegram-like интерфейс с левой колонкой чатов, правой областью переписки, embed-авторизацией через Loginus, realtime через WebSocket и базовыми действиями над чатами/сообщениями.

Фаза 1 не должна быть "заглушкой". После нее пользователь в Loginus должен открыть раздел чатов и получить понятный мессенджерный UX:

- слева список диалогов с аватарами, именами, превью, статусами, бейджами непрочитанных, pin/mute/delete;
- сверху слева Telegram-like hamburger menu с профилем и настройками;
- справа выбранный диалог с обоями, пузырями сообщений, composer и контекстным меню сообщений;
- все основные кнопки должны иметь спланированное рабочее поведение, даже если часть API придется добавить на backend.

### Обязательное правило для агентов (UI/UX)

**Перед любой UI-работой открыть и свериться со скриншотами** в `web/docs/screenshots/phase1/`.

Скриншоты — **главный визуальный референс**, важнее общих слов «как в Telegram». Если макет в коде расходится со скрином — править код под скрин, а не наоборот.

Порядок работы агента:

1. Открыть скрин нужного экрана (см. §3).
2. Сверить layout, отступы, иконки, цвета бейджей, состояния (active/muted).
3. Реализовать компонент.
4. Повторно сравнить с тем же скрином перед завершением задачи.

---

## 2. Визуальный тезис

ChatUs Web должен выглядеть как спокойный плотный Telegram-like messenger UI: светлые поверхности, один синий акцент, округлые интерактивные элементы, читаемые плотные списки, без generic SaaS cards, декоративных dashboard-панелей и лишних градиентов.

Ключевые визуальные правила:

- левая колонка — рабочий список, а не набор карточек;
- активный чат подсвечивается мягким синим/голубым состоянием;
- непрочитанные бейджи: синие для обычных чатов, серые для muted;
- статус отправки/прочтения: одна галочка `sent`, две галочки `read`, muted/secondary состояния не должны спорить с unread badge;
- правая область переписки использует Telegram-like wallpaper: лучше портировать паттерн/фон из mobile, если он есть; если нет — добавить отдельный спокойный SVG/CSS pattern в `web/src/assets/wallpapers/`;
- composer похож на Telegram: sticker слева, input по центру, paperclip справа внутри панели, voice message отдельной круглой кнопкой справа;
- контекстные меню и drawers открываются с быстрой, но сдержанной анимацией.

---

## 3. Скриншоты-референсы (UI/UX)

**Папка:** `web/docs/screenshots/phase1/`

Все изображения лежат в репозитории. Агенты **обязаны** использовать их как эталон при вёрстке и доработке компонентов.

### Карта скриншотов → экраны

| Файл | Что на скрине | Где в коде | Фаза |
|------|---------------|------------|------|
| [`chat-list.png`](docs/screenshots/phase1/chat-list.png) | Левая колонка: аватары, имена, превью, время, галочки, синие/серые бейджи, pin | `features/chat-list/*` | 1.2 |
| [`chat-list-hamburger.png`](docs/screenshots/phase1/chat-list-hamburger.png) | То же + кнопка «три штриха» слева (hamburger) | `ChatListHeader.tsx` | 1.2 / 1.6 |
| [`hamburger-menu.png`](docs/screenshots/phase1/hamburger-menu.png) | Меню по трём штрихам: профиль, настройки, пункты | `HamburgerMenu.tsx`, `SettingsDrawer.tsx` | 1.6 |
| [`settings-profile.png`](docs/screenshots/phase1/settings-profile.png) | Страница «Настройки» / просмотр профиля | `ProfileSettingsPage.tsx` | 1.6 |
| [`edit-profile.png`](docs/screenshots/phase1/edit-profile.png) | «Изменить профиль»: имя, фамилия, о себе, ДР, username | `ProfileEditPage.tsx`, `ProfileForm.tsx` | 1.6 |
| [`composer.png`](docs/screenshots/phase1/composer.png) | Поле ввода: стикер слева, скрепка, микрофон справа | `MessageComposer.tsx` | 1.3 / 1.4 |
| [`message-context-menu.png`](docs/screenshots/phase1/message-context-menu.png) | ПКМ по сообщению: реакции, ответить, копировать, закрепить, переслать, выбрать, удалить | `MessageContextMenu.tsx` | 1.5 |

Оригиналы с русскими именами (дубликаты) остаются в `web/docs/screenshots/`; для агентов использовать **только** `phase1/*.png` выше.

### Что сверять по каждому скрину

**`chat-list.png`**

- Круглые аватары слева.
- Имя контакта жирным, превью последнего сообщения серым.
- Время справа сверху.
- Одна галочка = отправлено, две = прочитано (для исходящих).
- Круглый бейдж непрочитанных: **синий** если чат не в mute, **серый** если в mute.
- Иконка pin для закреплённых.
- Активный чат — голубая подсветка строки.

**`chat-list-hamburger.png`**

- Кнопка меню (≡) слева в шапке списка.
- Поле поиска рядом с меню.

**`hamburger-menu.png`**

- Выпадающее/боковое меню с аватаром и именем вверху.
- Пункты: профиль, настройки и т.д. — как на скрине.

**`settings-profile.png`**

- Крупный аватар, имя, статус «был(а) …».
- Блоки: телефон, username, день рождения.
- Иконка карандаша для редактирования.

**`edit-profile.png`**

- Поля: имя (обязательно), фамилия, о себе (лимит символов), день рождения, имя пользователя.
- Кнопка смены фото на аватаре.

**`composer.png`**

- Белая скруглённая панель ввода.
- Слева: emoji/sticker.
- По центру: placeholder «Сообщение».
- Справа внутри панели: скрепка.
- Отдельная круглая кнопка справа: микрофон (голосовое).

**`message-context-menu.png`**

- Панель реакций сверху (emoji).
- Пункты: Ответить, Копировать текст, Закрепить, Переслать, Выбрать, Удалить (красным).
- Удаление: «у меня» / «у меня и у {имя}» — как в mobile.

### Встраивание скринов в задачи агента

В промпте для UI-задачи указывать:

```text
Сверься с web/docs/screenshots/phase1/<file>.png и web/PHASE1_PLAN.md §3, §7–9.
Цель: визуально максимально близко к скрину, не generic chat UI.
```

---

## 4. Архитектурные границы

Фаза 1 строится как отдельный React SPA в `web/`, не как React Native Web и не как порт mobile UI. Backend остается существующий NestJS в `server/`.

Разделение ответственности:

- **TanStack Router:** URL, layout routes, `/embed`, `/embed/chat/$chatId`, модальные/панельные состояния через search params только там, где нужен deep link.
- **TanStack Query:** серверные данные: текущий пользователь, список чатов, сообщения, профиль, mute/pin/delete mutations, read receipts, stickers/media metadata.
- **Zustand:** локальный UI-state: активный чат, открытые drawers/menus, draft composer, reply target, selected messages, context menu coordinates, recorder state, attachment picker state, embed auth phase.
- **WebSocket:** realtime events от сервера: новые сообщения, обновление статусов, typing, read receipts, изменения mute/pin/delete, invalidation или точечный `setQueryData`.

Правило: если состояние должно пережить refetch и является серверной правдой — это Query. Если это временное состояние интерфейса в текущем iframe — это Zustand.

---

## 5. Предлагаемая структура папок

```text
web/
├── PHASE1_PLAN.md
├── STACK.md
├── EMBED.md
├── docs/
│   └── screenshots/
│       └── phase1/          ← UI/UX референсы (обязательно для агентов)
│           ├── chat-list.png
│           ├── chat-list-hamburger.png
│           ├── hamburger-menu.png
│           ├── settings-profile.png
│           ├── edit-profile.png
│           ├── composer.png
│           └── message-context-menu.png
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── app/
    │   ├── AppProviders.tsx
    │   ├── queryClient.ts
    │   └── router.tsx
    ├── assets/
    │   └── wallpapers/
    │       └── telegram-pattern.svg
    ├── components/
    │   ├── avatar/
    │   │   ├── Avatar.tsx
    │   │   └── AvatarStack.tsx
    │   ├── buttons/
    │   │   ├── IconButton.tsx
    │   │   └── FloatingActionButton.tsx
    │   ├── menus/
    │   │   ├── ContextMenu.tsx
    │   │   └── Drawer.tsx
    │   └── ui/
    │       ├── Badge.tsx
    │       ├── Spinner.tsx
    │       └── EmptyState.tsx
    ├── embed/
    │   ├── loginusBridge.ts
    │   ├── embedAuth.ts
    │   └── embedTypes.ts
    ├── features/
    │   ├── chat-list/
    │   │   ├── ChatListColumn.tsx
    │   │   ├── ChatListHeader.tsx
    │   │   ├── ChatListSearch.tsx
    │   │   ├── ChatListItem.tsx
    │   │   ├── ChatUnreadBadge.tsx
    │   │   ├── ChatStatusChecks.tsx
    │   │   ├── ChatListItemMenu.tsx
    │   │   └── chatListFormatters.ts
    │   ├── conversation/
    │   │   ├── ConversationPane.tsx
    │   │   ├── ConversationHeader.tsx
    │   │   ├── MessageList.tsx
    │   │   ├── MessageBubble.tsx
    │   │   ├── MessageContextMenu.tsx
    │   │   ├── MessageComposer.tsx
    │   │   ├── StickerPicker.tsx
    │   │   ├── AttachmentPicker.tsx
    │   │   ├── VoiceRecorderButton.tsx
    │   │   └── messageFormatters.ts
    │   ├── profile/
    │   │   ├── SettingsDrawer.tsx
    │   │   ├── HamburgerMenu.tsx
    │   │   ├── ProfileSettingsPage.tsx
    │   │   ├── ProfileEditPage.tsx
    │   │   └── ProfileForm.tsx
    │   └── shell/
    │       ├── EmbedShell.tsx
    │       ├── MessengerLayout.tsx
    │       └── AuthGate.tsx
    ├── queries/
    │   ├── auth.queries.ts
    │   ├── chats.queries.ts
    │   ├── messages.queries.ts
    │   ├── profile.queries.ts
    │   └── media.queries.ts
    ├── routes/
    │   ├── __root.tsx
    │   ├── embed.tsx
    │   ├── embed.index.tsx
    │   ├── embed.chat.$chatId.tsx
    │   ├── embed.settings.tsx
    │   └── embed.settings.edit.tsx
    ├── services/
    │   ├── apiClient.ts
    │   ├── authService.ts
    │   ├── chatService.ts
    │   ├── messageService.ts
    │   ├── profileService.ts
    │   ├── mediaService.ts
    │   └── wsClient.ts
    ├── stores/
    │   ├── authUiStore.ts
    │   ├── chatUiStore.ts
    │   ├── composerStore.ts
    │   ├── menuStore.ts
    │   └── selectionStore.ts
    ├── styles/
    │   ├── globals.css
    │   ├── tokens.css
    │   └── layout.css
    └── types/
        ├── auth.ts
        ├── chat.ts
        ├── message.ts
        ├── profile.ts
        └── realtime.ts
```

---

## 6. Файлы и ответственность

### 6.1. App shell

`src/main.tsx`

- Монтирует React app.
- Подключает `AppProviders`.
- Не содержит бизнес-логики.

`src/app/AppProviders.tsx`

- Оборачивает приложение в TanStack Router, TanStack Query и базовые error boundaries.
- Инициализирует глобальные CSS.

`src/app/queryClient.ts`

- Настройки Query: retry, stale time, cache time.
- Общий обработчик `401`: переводит embed auth в error/re-auth state.

`src/app/router.tsx`

- Создает TanStack Router.
- Подключает route tree.

`src/assets/wallpapers/telegram-pattern.svg`

- Telegram-like фон переписки.
- Должен быть спокойным, не конкурировать с текстом сообщений и работать на светлой теме.
- Если фон портируется из mobile, этот файл можно заменить на экспортированный SVG/PNG pattern.

`src/components/avatar/Avatar.tsx`

- Единый avatar для пользователей, групп и чатов.
- Показывает image, fallback initials и online/muted overlay только если это нужно конкретному месту.
- Должен иметь размеры для chat list, conversation header, profile row.

`src/components/avatar/AvatarStack.tsx`

- Компактное отображение нескольких участников для групп/каналов, если backend отдает несколько avatars.
- В фазе 1 optional, но дерево оставляет место для групповых чатов.

`src/components/buttons/IconButton.tsx`

- Базовая кнопка для hamburger, sticker, paperclip, close, pencil и message actions.
- Обязательны `aria-label`, focus state и disabled/loading state.

`src/components/buttons/FloatingActionButton.tsx`

- Круглая акцентная кнопка для voice message и будущих floating actions.
- Не должна вводить второй accent color.

`src/components/menus/ContextMenu.tsx`

- Общий позиционируемый context menu для message menu и chat item menu.
- Закрывается по outside click, Escape, scroll route change.
- Должен учитывать viewport bounds, чтобы меню не выходило за iframe.

`src/components/menus/Drawer.tsx`

- Общий drawer для settings/hamburger.
- Поддерживает slide-in анимацию, backdrop, Escape и focus return.

`src/components/ui/Badge.tsx`

- Базовый badge для unread count и маленьких status indicators.
- Варианты: `accent` для blue unread, `muted` для gray unread.

`src/components/ui/Spinner.tsx`

- Минимальный loading indicator для auth exchange, chat list и messages.
- Без декоративной анимации, которая отвлекает от messenger UI.

`src/components/ui/EmptyState.tsx`

- Empty states для "нет чатов", "выберите чат", "нет сообщений".
- Текст должен быть коротким и утилитарным.

`src/features/shell/AuthGate.tsx`

- Ждет `loginus:init`.
- Выполняет exchange через `authService`.
- Показывает состояния: waiting, exchanging, ready, error.
- После успешного exchange сообщает Loginus `loginus:ready`.

`src/features/shell/EmbedShell.tsx`

- Корневой layout для `/embed`.
- Держит full-height iframe-safe layout.
- Не должен зависеть от Loginus sidebar ширины: ChatUs занимает весь iframe.

`src/features/shell/MessengerLayout.tsx`

- Desktop layout: левая колонка чатов + правая переписка.
- Mobile web позже может переключать layout на single-pane, но в фазе 1 минимум должен не ломаться в узком iframe.

### 6.2. Embed/Loginus

`src/embed/loginusBridge.ts`

- Слушает `window.postMessage`.
- Принимает только события `loginus:init`.
- Проверяет `event.source === window.parent`.
- Проверяет origin по allowlist из env/config.
- Отправляет `loginus:ready`, будущие `loginus:error`, `loginus:openLink`.

`src/embed/embedAuth.ts`

- Оркестрирует exchange `initData` на ChatUs backend.
- Хранит access token в memory/Zustand или передает в `apiClient`.
- Не кладет token в URL.

`src/embed/embedTypes.ts`

- Типы `LoginusInitMessage`, `LoginusReadyMessage`, payload exchange.

### 6.3. Services

`src/services/apiClient.ts`

- Единый `fetch` wrapper.
- Добавляет `Authorization: Bearer <token>`.
- Парсит JSON и нормализует ошибки.
- Работает с `VITE_API_BASE_URL`.

`src/services/authService.ts`

- `exchangeLoginusInitData(initData)`.
- `getMe()` если backend поддерживает отдельный endpoint.

`src/services/chatService.ts`

- `listChats()`.
- `muteChat(chatId)`, `unmuteChat(chatId)`.
- `pinChat(chatId)`, `unpinChat(chatId)`.
- `deleteChatForMe(chatId)`.
- `deleteChatForBoth(chatId)` если пользователь имеет право.

`src/services/messageService.ts`

- `listMessages(chatId, cursor)`.
- `sendTextMessage(chatId, text, replyToId?)`.
- `sendStickerMessage(chatId, stickerId)`.
- `sendAttachmentMessage(chatId, uploadedMedia)`.
- `sendVoiceMessage(chatId, audioBlob/meta)`.
- `replyToMessage`, `copy` делается на клиенте через Clipboard API.
- `pinMessage`, `forwardMessage`, `deleteMessageForMe`, `deleteMessageForBoth`.

`src/services/profileService.ts`

- `getProfile()`.
- `updateProfile({ firstName, lastName, bio, birthday, username })`.
- `updateAvatar(file)` если backend поддерживает загрузку аватара.

`src/services/mediaService.ts`

- Загрузка файлов для paperclip.
- Получение sticker packs / sticker list.
- Подготовка voice blob upload.

`src/services/wsClient.ts`

- Подключение к `VITE_WS_URL` после auth ready.
- Reconnect с backoff.
- Преобразование server events в typed events.
- Интеграция с Query cache через отдельный handler в `queries` или `features/shell`.

### 6.5. Routes

`src/routes/__root.tsx`

- Root route TanStack Router.
- Подключает root error boundary и базовый document/layout wrapper.

`src/routes/embed.tsx`

- Layout route для embedded app.
- Рендерит `AuthGate` и `EmbedShell`.
- Должен быть единственной точкой, где Loginus embed lifecycle влияет на route tree.

`src/routes/embed.index.tsx`

- Default state `/embed`.
- На desktop показывает chat list и empty conversation state "Выберите чат".
- Если есть last active chat, можно redirect/open его только после явного продуктового решения.

`src/routes/embed.chat.$chatId.tsx`

- Route выбранного чата.
- Валидирует `chatId`, включает `ConversationPane`.
- Не хранит messages в route state.

`src/routes/embed.settings.tsx`

- Route/profile settings view, если settings открываются как route, а не только drawer.
- Должен быть совместим с drawer UX: direct link показывает settings поверх shell.

`src/routes/embed.settings.edit.tsx`

- Route edit profile.
- Содержит форму редактирования и save/cancel navigation.

### 6.6. Queries

`src/queries/auth.queries.ts`

- `useMeQuery()`.
- Может быть disabled до `embedStatus === 'ready'`.

`src/queries/chats.queries.ts`

- `useChatsQuery()`.
- Mutations: mute/unmute, pin/unpin, delete for me/delete for both.
- Optimistic updates:
  - mute меняет цвет unread badge с синего на серый;
  - pin поднимает чат в pinned section;
  - delete убирает чат из списка.

`src/queries/messages.queries.ts`

- `useMessagesQuery(chatId)` с пагинацией.
- Mutations: send, pin, forward, delete.
- Optimistic outgoing message с локальным `clientId` и состоянием sending/sent/error.

`src/queries/profile.queries.ts`

- `useProfileQuery()`.
- `useUpdateProfileMutation()` с invalidate `me/profile`.

`src/queries/media.queries.ts`

- `useStickerPacksQuery()`.
- `useUploadAttachmentMutation()`.
- `useUploadVoiceMutation()`.

### 6.7. Zustand stores

`src/stores/authUiStore.ts`

- `embedStatus`: `waiting_init | exchanging | ready | error`.
- `authError`.
- `accessToken` только в memory, если не используется cookie-only.

`src/stores/chatUiStore.ts`

- `activeChatId`.
- `searchQuery`.
- `isChatListSearchFocused`.
- `isSettingsDrawerOpen`.

`src/stores/composerStore.ts`

- Draft text по `chatId`.
- `replyToMessageId`.
- `isStickerPickerOpen`.
- `isAttachmentPickerOpen`.
- Voice recording UI state.

`src/stores/menuStore.ts`

- Открытое hamburger/settings menu.
- Открытое контекстное меню сообщения: `messageId`, координаты, доступные действия.
- Открытое меню элемента чата.

`src/stores/selectionStore.ts`

- Режим выбора сообщений.
- Набор selected message ids.
- Действия bulk delete/forward в будущих фазах.

### 6.8. Styles

`src/styles/globals.css`

- Reset/base styles для iframe-safe app.
- Настраивает `html`, `body`, `#root` на full height.
- Задает базовую типографику и smoothing.

`src/styles/tokens.css`

- CSS variables: colors, blue accent, muted text, borders, radii, shadows, column widths, composer height.
- Все feature CSS должны брать значения отсюда, чтобы Telegram-like стиль был единым.

`src/styles/layout.css`

- Глобальные layout utilities для shell: full-height panes, scroll containers, responsive breakpoints.
- Не должен превращаться в dumping ground для feature-specific стилей.

### 6.9. Types

`src/types/auth.ts`

- ChatUs session, current user, Loginus exchange response.

`src/types/chat.ts`

- Chat summary, chat kind, unread state, mute/pin flags, last message preview.

`src/types/message.ts`

- Message model, message kind, delivery/read status, attachment/sticker/voice metadata.

`src/types/profile.ts`

- Editable profile fields and validation-related types.

`src/types/realtime.ts`

- WebSocket event discriminated unions.
- Payloads should be typed narrowly enough for cache updates without `any`.

---

## 7. Экран: левая колонка чатов

**UI-референсы:** `docs/screenshots/phase1/chat-list.png`, `docs/screenshots/phase1/chat-list-hamburger.png`

### Компоненты

`ChatListColumn.tsx`

- Контейнер всей левой колонки.
- Содержит `ChatListHeader`, `ChatListSearch`, список pinned и обычных чатов.
- Управляет empty/loading/error состояниями через Query.

`ChatListHeader.tsx`

- Слева hamburger button.
- Рядом/ниже search input по Telegram-like референсу.
- Hamburger открывает `SettingsDrawer` или `HamburgerMenu`.

`ChatListSearch.tsx`

- Фильтрует локально уже загруженные чаты или пишет `?q=` в search params, если backend search появится.

`ChatListItem.tsx`

- Аватар.
- Имя контакта/чата.
- Последнее сообщение: текст, `Photo`, `Voice message`, `Sticker`, `File` и т.п.
- Время последнего сообщения.
- Статус outgoing последнего сообщения: одна галочка / две галочки.
- Unread count badge.
- Muted icon/state.
- Pinned icon/state.
- Right-click или secondary menu для mute/pin/delete.

`ChatUnreadBadge.tsx`

- Синий badge для непрочитанных в не-muted чате.
- Серый badge для muted чата.
- Скрыт при `unreadCount === 0`.

`ChatStatusChecks.tsx`

- Одна галочка для `sent/delivered`.
- Две галочки для `read`.
- Для входящих сообщений не показывается.

`ChatListItemMenu.tsx`

- Действия:
  - mute / unmute;
  - pin / unpin;
  - delete chat;
  - в delete confirmation: `Удалить у меня` и `Удалить у всех`, если backend и права позволяют.

### Поведение

- Pin поднимает чат выше обычных, сохраняя сортировку pinned по времени/порядку backend.
- Mute не скрывает unread count, только меняет цвет badge на серый и отключает будущие notification hooks.
- Delete for me убирает диалог только у текущего пользователя.
- Delete for both должен быть доступен только если backend разрешает действие. Если endpoint отсутствует, UI должен быть спланирован, но временно disabled с понятной подписью в dev build.
- При выборе чата обновляется route `/embed/chat/$chatId`.

### Acceptance criteria

- Визуально совпадает с `docs/screenshots/phase1/chat-list.png` и `chat-list-hamburger.png`.
- Видна Telegram-like левая колонка с аватарами, именами, превью, временем и статусом последнего сообщения.
- Непрочитанные отображаются badge; muted чаты имеют серый badge.
- Mute/unmute работает optimistic и синхронизируется с backend.
- Pin/unpin работает и меняет порядок списка.
- Delete chat показывает выбор `для меня` / `для всех`, где доступно.
- При клике по чату справа открывается переписка.

---

## 8. Экран: hamburger menu, settings, profile edit

**UI-референсы:** `docs/screenshots/phase1/hamburger-menu.png`, `settings-profile.png`, `edit-profile.png`

### Компоненты

`HamburgerMenu.tsx`

- Открывается по кнопке из `ChatListHeader`.
- Верхняя profile row: аватар thumbnail, имя, username/phone/email если есть.
- Пункты: Settings/Profile, возможно Saved Messages/New Group в будущих фазах.

`SettingsDrawer.tsx`

- Telegram-like drawer или full-height side panel.
- Должен закрываться по backdrop, Escape и повторному hamburger.

`ProfileSettingsPage.tsx`

- Страница профиля как на screenshot.
- Крупный avatar/header.
- Имя, username, bio/about, birthday.
- Кнопка pencil edit.

`ProfileEditPage.tsx`

- Открывается по pencil.
- Поля:
  - first name;
  - last name;
  - bio/about;
  - birthday;
  - username `@user`.
- Сохранение через `profileService.updateProfile`.

`ProfileForm.tsx`

- Валидация:
  - first name не пустой;
  - username без `@` внутри значения, UI показывает `@` как prefix;
  - birthday в ISO/date-compatible формате;
  - bio ограничить по backend limit, если известен.

### Acceptance criteria

- Hamburger menu совпадает с `hamburger-menu.png` (три линии, drawer, profile row с avatar).
- Profile/settings page совпадает со `settings-profile.png` по структуре.
- Edit profile совпадает с `edit-profile.png` (поля, карандаш, смена фото).
- Pencil открывает edit profile.
- Пользователь может изменить first name, last name, bio/about, birthday, username.
- После сохранения профиль и hamburger row обновляются без reload iframe.

---

## 9. Экран: правая область переписки

**UI-референсы:** `docs/screenshots/phase1/composer.png`, `message-context-menu.png`

### Компоненты

`ConversationPane.tsx`

- Состояния:
  - нет выбранного чата;
  - loading selected chat/messages;
  - active conversation;
  - error.
- Фон — Telegram-like wallpaper.

`ConversationHeader.tsx`

- Аватар, имя чата/контакта, online/last seen или participants metadata, если backend отдает.
- В фазе 1 достаточно header без сложного профиля чата, но клик по header можно зарезервировать под future profile.

`MessageList.tsx`

- Виртуализация или простая прокрутка для MVP; если история длинная, сразу планировать `react-virtual` или свой windowing позже.
- Infinite scroll вверх по cursor.
- Auto-scroll вниз для новых сообщений только если пользователь уже близко к низу.

`MessageBubble.tsx`

- Входящие слева, исходящие справа.
- Telegram-like скругления.
- Время сообщения.
- Для исходящих: sending/sent/read state.
- Поддержать минимум text; визуально заложить типы image, voice, video_note, video, file, system.

`MessageComposer.tsx`

- Layout:
  - sticker button слева;
  - input по центру;
  - paperclip справа;
  - voice message far right отдельной кнопкой.
- Enter отправляет, Shift+Enter перенос строки.
- Пустой input не отправляется.
- При открытом reply показывает reply preview над input.
- **Drag-and-drop:** зона сброса на области переписки (`ConversationDropZone`); оверлей «Отпустите файлы для отправки»; тот же upload+send flow, что у скрепки; очередь из нескольких файлов.

`StickerPicker.tsx`

- Открывается sticker button.
- Загружает sticker packs через Query.
- Клик по sticker отправляет `sticker` message.

`AttachmentPicker.tsx`

- Открывается paperclip.
- Действия: image/video/file.
- Загружает файл через `mediaService`, затем отправляет message.

`VoiceRecorderButton.tsx`

- Запрашивает microphone permission.
- Recording states: idle, recording, locked/cancelled если будет усложнение позже.
- После stop загружает audio и отправляет voice message.

`MessageContextMenu.tsx`

- Открывается right click на message.
- Действия:
  - reply;
  - copy text;
  - pin;
  - forward;
  - select;
  - delete.
- Delete submenu/confirmation:
  - `Удалить у меня`;
  - `Удалить у меня и у {username}` для 1:1 чата или `Удалить у всех` для группы, если backend разрешает.

### Acceptance criteria

- Layout desktop: слева chat list, справа conversation area.
- Фон переписки не plain white: есть Telegram-like wallpaper.
- Composer совпадает с `composer.png`: sticker слева, input, скрепка, микрофон отдельной кнопкой справа.
- Text send работает optimistic и через backend.
- Sticker/attachment/voice кнопки открывают рабочие UI flows; если backend endpoint отсутствует, это явно отражено в API gap list и не ломает text flow.
- Message bubbles похожи на Telegram по расположению, форме и плотности.
- Right-click context menu совпадает с `message-context-menu.png`: reply/copy/pin/forward/select/delete.
- Delete предлагает `для меня` и `для меня и username/для всех`, где доступно.

---

## 10. Realtime и синхронизация

`wsClient` должен подключаться только после успешного embed exchange.

Минимальные события фазы 1:

- `message:new` — добавить сообщение в `messages` cache и обновить `lastMessage` в `chats`;
- `message:updated` — обновить статус, pinned state или текст/metadata;
- `message:deleted` — убрать/пометить сообщение;
- `chat:updated` — mute/pin/unread/lastMessage changes;
- `receipt:read` — обновить две галочки;
- `typing` — можно заложить тип, UI необязателен в фазе 1.

Стратегия cache update:

- точечно использовать `queryClient.setQueryData`, если payload полный;
- использовать `invalidateQueries`, если payload неполный или порядок списка может измениться сложно;
- не хранить копию server data в Zustand.

---

## 11. Server/API assumptions и возможные gaps

Опорная авторизация из embed:

- `POST /api/auth/loginus/exchange { initData }` — описано в `web/EMBED.md`.
- Ответ должен вернуть access token и текущего пользователя.

Предполагаемые endpoints для фазы 1:

```text
GET    /api/me
PATCH  /api/me/profile
POST   /api/me/avatar

GET    /api/chats
PATCH  /api/chats/:chatId/mute
DELETE /api/chats/:chatId/mute
PATCH  /api/chats/:chatId/pin
DELETE /api/chats/:chatId/pin
DELETE /api/chats/:chatId?scope=me
DELETE /api/chats/:chatId?scope=all

GET    /api/chats/:chatId/messages?cursor=
POST   /api/chats/:chatId/messages
POST   /api/chats/:chatId/read

POST   /api/messages/:messageId/pin
POST   /api/messages/:messageId/forward
DELETE /api/messages/:messageId?scope=me
DELETE /api/messages/:messageId?scope=all

GET    /api/stickers/packs
POST   /api/media/upload
POST   /api/media/voice
```

Что может отсутствовать в backend и требует проверки перед реализацией:

- отдельный endpoint `loginus/exchange` для iframe initData;
- mute/unmute на уровне чата для web;
- pin/unpin чата;
- delete chat for both;
- delete message for both с проверкой прав;
- message pin;
- forward message;
- stickers list/send;
- upload endpoint, совместимый с web `File`/`Blob`;
- voice upload с browser-recorded audio format;
- profile fields: `firstName`, `lastName`, `bio/about`, `birthday`, `username`;
- username uniqueness validation.

Если endpoint отсутствует, фаза 1 должна фиксировать это как backend task, а frontend оставлять UI flow и типы готовыми к подключению.

---

## 12. Порядок реализации

### Фаза 1.1 — scaffold и embed boot ✅

- [x] Создать Vite React TS app в `web/`.
- [x] Подключить TanStack Router, TanStack Query, Zustand.
- [x] Настроить `vite.config.ts` с `base: '/embed/'`.
- [x] Создать `AppProviders`, route tree и `EmbedShell`.
- [x] Реализовать `loginusBridge`, `embedAuth`, `AuthGate`.
- [x] Подключить `apiClient` и exchange endpoint.
- [x] Добавить базовые CSS tokens: colors, radii, typography, layout sizes.

Готово, когда `/embed` ждет `loginus:init`, делает exchange и показывает shell после success.

### Фаза 1.2 — layout и chat list ✅

**Сверка:** `docs/screenshots/phase1/chat-list.png`, `chat-list-hamburger.png`

- [x] Реализовать `MessengerLayout`.
- [x] Реализовать `ChatListColumn` и loading/empty/error states.
- [x] Реализовать `ChatListItem`: avatar, name, preview, time, checks, unread badge.
- [x] Добавить muted gray badge и normal blue badge.
- [x] Добавить chat item menu: mute/unmute, pin/unpin, delete.
- [x] Подключить `useChatsQuery` и mutations.

Готово, когда пользователь видит Telegram-like список и может выбрать чат.

### Фаза 1.3 — conversation и messages ✅

**Сверка:** `docs/screenshots/phase1/composer.png`

- [x] Реализовать `ConversationPane` с wallpaper.
- [x] Реализовать `ConversationHeader`.
- [x] Реализовать `MessageList` и `MessageBubble`.
- [x] Подключить `useMessagesQuery(chatId)`.
- [x] Реализовать отправку text message через composer.
- [x] Добавить optimistic outgoing state и read/sent checks.

Готово, когда выбранный чат открывается справа, история грузится, новое text-сообщение отправляется.

### Фаза 1.4 — composer actions ✅

- [x] Реализовать `StickerPicker` и service/query для stickers.
- [x] Реализовать `AttachmentPicker` и upload flow.
- [x] Реализовать drag-and-drop вложений на область переписки.
- [x] Реализовать `VoiceRecorderButton` через MediaRecorder.
- [x] Добавить reply preview в composer.
- [x] Обработать ошибки permission/upload/send.

Готово, когда sticker/attachment/voice кнопки открывают рабочие сценарии и не ломают отправку text.

### Фаза 1.5 — message context menu ✅

**Сверка:** `docs/screenshots/phase1/message-context-menu.png`

- [x] Реализовать right-click `MessageContextMenu`.
- [x] Reply выставляет `replyToMessageId` и preview.
- [x] Copy text использует Clipboard API.
- [x] Pin вызывает mutation.
- [x] Forward открывает выбор чата или минимальный forward dialog.
- [x] Select включает selection mode.
- [x] Delete показывает выбор scope: for me / for me and username / all.

Готово, когда контекстное меню соответствует референсу и действия либо работают, либо явно завязаны на backend gaps.

### Фаза 1.6 — hamburger, settings, profile edit ✅

**Сверка:** `hamburger-menu.png`, `settings-profile.png`, `edit-profile.png`

- [x] Реализовать `HamburgerMenu`/`SettingsDrawer`.
- [x] Реализовать profile row с avatar thumbnail и именем.
- [x] Реализовать `ProfileSettingsPage`.
- [x] Реализовать pencil → `ProfileEditPage`.
- [x] Реализовать form и `updateProfile` mutation.
- [x] Обновлять Query cache после сохранения.

Готово, когда профиль можно открыть и отредактировать без перезагрузки iframe.

### Фаза 1.7 — WebSocket integration ✅

- [x] Реализовать `wsClient` с auth token.
- [x] Подключить reconnect.
- [x] Обновлять Query cache по `message:new`, `chat:updated`, `receipt:read`.
- [x] Показать connection degraded state, если WS отвалился.

Готово, когда новые сообщения/статусы приходят без ручного reload.

### Фаза 1.8 — polish, iframe hardening, checks ✅

- [x] Проверить layout в iframe Loginus: desktop и узкая ширина.
- [x] Проверить CSP/frame-ancestors по `web/EMBED.md`.
- [x] Проверить keyboard UX: Escape, Enter, Shift+Enter, focus after send.
- [x] Проверить empty states: нет чатов, нет сообщений, ошибка auth.
- [x] Проверить accessibility basics: button labels, focus rings, contrast.
- [x] Прогнать lint/typecheck/build.

Готово, когда app готов к POC в Loginus `/ru/support`.

---

## 13. Общие acceptance criteria фазы 1

- `/embed` работает как iframe app и не требует отдельного логина ChatUs.
- После Loginus initData web client получает ChatUs session через exchange.
- Desktop layout: левая колонка чатов + правая переписка.
- Chat list содержит avatars, contact names, last message preview, sent/read checks, unread count badge.
- Muted unread badge серый, обычный unread badge синий.
- Mute/unmute, pin/unpin и delete chat спланированы и подключены к Query mutations.
- Hamburger menu открывает Telegram-like settings drawer/menu.
- Profile row показывает имя и avatar thumbnail.
- Profile/settings page и edit profile page соответствуют референсам.
- Редактируются first name, last name, bio/about, birthday, username.
- Conversation area использует Telegram-like wallpaper.
- Composer содержит sticker, input, paperclip, voice controls.
- Message bubbles визуально близки к Telegram.
- Right-click message context menu содержит reply, copy text, pin, forward, select, delete.
- Delete message поддерживает выбор `delete for me` и `delete for me and username/all`, если backend разрешает.
- TanStack Query хранит серверные данные; Zustand хранит только UI-state.
- WebSocket events обновляют список чатов и сообщения без reload.

---

## 14. Что не включать в фазу 1

- WebRTC audio/video calls.
- Offline-first SQLite для web.
- Telegram/TDLib integration.
- Полноценный Loginus sidebar unread badge вне iframe.
- Сложные channel flows, если они не нужны для первого embedded messenger screen.
- Переписывание mobile UI или shared package до стабилизации web POC.

---

## 15. Риски

- Backend может не иметь всех endpoints для Telegram-like actions. Нужно быстро инвентаризировать `server/src` перед реализацией.
- Browser voice recording зависит от permissions и формата audio. Нужен fallback/error state.
- Third-party cookies в iframe могут блокироваться, поэтому token-in-memory после exchange надежнее для фазы 1.
- Message virtualization может понадобиться раньше, если история большая.
- Delete for both требует строгой server-side проверки прав; frontend не должен решать права самостоятельно.
- Username editing требует уникальности и нормализации на backend.

---

## 16. Минимальный dev/test checklist

- [ ] `npm run typecheck` или эквивалент.
- [ ] `npm run lint` или эквивалент.
- [ ] `npm run build`.
- [ ] Manual: auth success через mocked/real `loginus:init`.
- [ ] Manual: auth error при invalid initData.
- [ ] Manual: chat list states: loading, empty, with unread, muted, pinned.
- [ ] Manual: open chat, send text, receive WS message.
- [ ] Manual: mute/unmute, pin/unpin, delete confirmation.
- [ ] Manual: hamburger → settings → edit profile → save.
- [ ] Manual: right-click message context menu actions.
- [ ] Manual: composer sticker/attachment/voice buttons open expected flows.

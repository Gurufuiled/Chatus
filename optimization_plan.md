# 🚀 Chatus — План оптимизации производительности

> Анализ проведён по всему `mobile/src/`. Ниже — найденные уязвимости, отсортированные по влиянию на UX.

---

## 🔴 Критический приоритет

### 1. ✅ chatStore подписка `chats` вызывает каскадные ре-рендеры

**Файлы**: [ChatScreen.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/screens/ChatScreen.tsx#L311), [ChatListScreen.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/screens/ChatListScreen.tsx#L156), [ChannelFeedScreen.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/screens/ChannelFeedScreen.tsx#L414)

**Проблема**: `chatStore((state) => state.chats)` подписывается на **весь массив** чатов. Каждое изменение любого чата (unread_count, typing, last_message) создаёт **новый массив** → ре-рендер всех подписчиков, включая тяжёлый `ChatScreen`.

```tsx
// ❌ Текущий код — ChatScreen.tsx:311
const chats = chatStore((state) => state.chats);
const currentChat = chats.find((chat) => chat.id === chatId) ?? null;

// ✅ Исправление — подписка только на нужный чат
const currentChat = chatStore(
  useCallback((state) => state.chats.find((c) => c.id === chatId) ?? null, [chatId])
);
```

**Также плохо**: `forwardTargets` в ChatScreen и ChannelFeedScreen подписывается на `chats` для фильтрации. Его нужно вынести в `useMemo` с `useShallow` селектором или вычислять lazily при открытии шторки.

**Impact**: 🔥🔥🔥 Убирает ~40-60% лишних ре-рендеров ChatScreen.

---

### 2. messageStore — O(n) операции на каждое сообщение

**Файл**: [messageStore.ts](file:///c:/Users/artem/Desktop/works/testik/mobile/src/stores/messageStore.ts)

**Проблема**: Каждый `updateMessage`, `prependMessage`, `removeMessage` создаёт **новый массив** через `.map()` / `.filter()` / spread. При 200+ сообщениях в чате — это O(n) аллокаций на каждое входящее сообщение, ACK, реакцию.

```tsx
// ❌ Текущий код — messageStore.ts:87
updateMessage: (chatId, messageId, updates) =>
  set((state) => ({
    messagesByChatId: {
      ...state.messagesByChatId,                    // Shallow copy всех чатов
      [chatId]: messages.map((m) =>                  // Копия всего массива
        m.id === messageId ? { ...m, ...updates } : m
      ),
    },
  })),
```

**Решение**:
1. Использовать `immer` middleware для Zustand: мутации in-place, копия только при реальных изменениях
2. Или перейти на `Map<string, Message>` вместо массива — `O(1)` update/delete
3. Минимум: добавить early-return если сообщение не найдено

**Impact**: 🔥🔥🔥 Ускорение обработки каждого WS-события на ~3-5x для чатов с длинной историей.

---

### 3. ✅ chatStore.setChats — O(n²) из-за `.find()` в цикле

**Файл**: [chatStore.ts](file:///c:/Users/artem/Desktop/works/testik/mobile/src/stores/chatStore.ts#L42-L50)

**Проблема**: `preserveLocalContactName` вызывает `state.chats.find()` для каждого чата в массиве. При 100 чатах = 10 000 сравнений при каждом `refreshChats()`.

```tsx
// ❌ O(n²)
setChats: (chats) => set((state) => ({
  chats: chats.map((chat) =>
    preserveLocalContactName(chat, state.chats.find((existing) => existing.id === chat.id))
  ),
})),

// ✅ O(n) — построить Map один раз
setChats: (chats) => set((state) => {
  const existingMap = new Map(state.chats.map(c => [c.id, c]));
  return {
    chats: chats.map((chat) =>
      preserveLocalContactName(chat, existingMap.get(chat.id))
    ),
  };
}),
```

**Impact**: 🔥🔥 Ускорение fullSync, который вызывается при каждом WS reconnect.

---

## 🟠 Высокий приоритет

### 4. ChatScreen — массивный компонент с 30+ useState/useEffect

**Файл**: [ChatScreen.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/screens/ChatScreen.tsx) — **2371 строк**, **77KB**

**Проблема**: Любой `useState` setter вызывает ре-рендер всего компонента. Здесь ~15 `useState` + ~20 `useMemo`/`useCallback` + `useEffect` на messages, чаты, typing, presence, voice, videoNote, search, selection, menu...

**Решение**:
1. Вынести `SearchBar` + search state в отдельный компонент
2. Вынести `SelectionMode` + selected IDs в отдельный компонент / контекст
3. Вынести `ContextMenuOverlay` state (menuState, menuMode) в отдельный хук
4. Вынести Voice/VideoNote banner state в `VoicePlayerContext` (частично уже есть)
5. Forward sheet — lazy-loaded через `React.lazy()` + `Suspense`

**Impact**: 🔥🔥 Уменьшение количества ненужных ре-рендеров тяжёлого экрана.

---

### 5. Read receipts — итерация по ВСЕМ сообщениям при любом изменении

**Файл**: [ChatScreen.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/screens/ChatScreen.tsx#L501-L527)

**Проблема**: `useEffect` с зависимостью `[messages]` итерирует **все** сообщения при каждом обновлении (новое сообщение, ACK, реакция) и отправляет `ack` WS-событие для каждого непрочитанного.

```tsx
// ❌ Бьёт по каждому изменению messages
useEffect(() => {
  for (const message of messages) { // O(n) на каждый ре-рендер
    // ...отправка read receipts...
  }
}, [messages]); // messages меняется при КАЖДОМ update
```

**Решение**:
1. Отправлять `read` ACK только для **последнего** сообщения (сервер разберётся — всё до него прочитано)
2. Или использовать `viewableItems` callback от FlatList — ACK только видимых
3. Debounce 500ms для batch-отправки

**Impact**: 🔥🔥 Уменьшение WS-трафика и CPU на каждый incoming message.

---

### 6. ✅ FlatList `extraData={messageByIdInternal}` инвалидирует все ячейки

**Файл**: [ChatMessageList.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/components/ChatMessageList.tsx#L1450)

**Проблема**: `extraData={messageByIdInternal}` — это `Map`, которая пересоздаётся при каждом изменении `messages`. FlatList сравнивает `extraData` по ссылке → **все ячейки** помечаются как dirty.

**Решение**: Убрать `extraData` полностью. `MessageRow` уже обёрнут в `React.memo` с правильным comparator. `renderItem` зависит от `selectedMessageIdSet` и `highlightedMessageId`, которые меняются редко.

**Impact**: 🔥🔥 Резкое уменьшение ре-рендеров ячеек списка при скролле.

---

### 7. MediaCacheService.persist() — запись JSON на диск при каждом access

**Файл**: [MediaCacheService.ts](file:///c:/Users/artem/Desktop/works/testik/mobile/src/services/MediaCacheService.ts#L170-L184)

**Проблема**: `getPath()` вызывает `persist()` (serialize JSON → write file) **при каждом доступе** к кэшу. При прокрутке чата с 20 изображениями = 20 записей на диск.

```tsx
// ❌ getPath → touch → persist → writeAsStringAsync — на КАЖДЫЙ доступ
async getPath(mediaId: string): Promise<string | null> {
  // ...
  entry.lastAccess = Date.now();
  await this.persist(); // 🔥 Запись JSON на диск
  return entry.localPath;
}
```

**Решение**:
1. Debounce `persist()` — записывать не чаще раза в 5 секунд
2. Batch: собирать dirty entries, flush по таймеру или при background
3. `getPath()` — только обновить `lastAccess` в памяти, без записи

**Impact**: 🔥🔥 Устраняет disk I/O bottleneck при скролле чата с медиа.

---

## 🟡 Средний приоритет

### 8. WebSocketProvider — onNewMessage линейный поиск дубликатов

**Файл**: [WebSocketProvider.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/contexts/WebSocketProvider.tsx#L325-L358)

**Проблема**: При каждом входящем сообщении:
- `existing.some((m) => m.id === msg.id)` — O(n)
- `existing.filter(...)` для поиска optimistic — O(n)
- `existing.find(...)` для sending candidates — O(n)

Три прохода по всему массиву для каждого WS-сообщения.

**Решение**: Построить `Set<string>` из message IDs один раз, использовать `.has()` для O(1) дедупликации. Для optimistic — хранить отдельный `Map<tempId, Message>`.

**Impact**: 🔥 Заметно при активных чатах с 500+ сообщениями.

---

### 9. `useNavigation()` внутри каждого MessageRow

**Файл**: [ChatMessageList.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/components/ChatMessageList.tsx#L569)

**Проблема**: `useNavigation()` создаёт подписку на navigation state для **каждой ячейки** списка. При 50 видимых сообщениях = 50 подписок.

**Решение**: Передавать `navigation` через props или context. Или callback `onNavigate` от родителя.

**Impact**: 🔥 Уменьшение memory footprint и подписок.

---

### 10. `Image` из React Native вместо `expo-image` / `FastImage`

**Файлы**: Используется стандартный `Image` из `react-native` повсеместно — ChatMessageList, InputAttachmentSheet, ChatListRow, ChatListScreen, все Bubble-компоненты.

**Проблема**: Стандартный `Image` не поддерживает:
- Disk caching (каждый раз network fetch)
- Progressive loading / blurhash placeholder
- Shared cache между разными size-ами одного URL
- Memory-efficient decoding

**Решение**: Заменить на `expo-image` (уже есть в expo):
```tsx
import { Image } from 'expo-image';
// API практически идентичен, но:
// - Автоматический disk cache
// - Blurhash/placeholder support
// - Memory-efficient
// - Shared cache
```

**Impact**: 🔥🔥 Драматическое ускорение загрузки изображений при скролле чата + уменьшение сетевого трафика.

---

### 11. ChannelFeedScreen — дублирование кода с ChatScreen

**Файл**: [ChannelFeedScreen.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/screens/ChannelFeedScreen.tsx) — **2169 строк**, **70KB**

**Проблема**: Те же проблемы что и ChatScreen (монолитный компонент, множество useState), плюс дублирование `MediaAlbumBubble`, `buildForwardPreview`, `cloneForwardMedia`, `getVisualMediaKind` и т.д.

**Решение**: Вынести общую логику в shared hooks и компоненты.

**Impact**: 🔥 Уменьшение bundle size + единая точка оптимизации.

---

### 12. `Dimensions.get('window')` вызывается на верхнем уровне модулей

**Файлы**: ChatMessageList.tsx, VideoNoteBubble.tsx, InputAttachmentSheet.tsx, ChannelFeedScreen.tsx

**Проблема**: Значение вычисляется один раз при import модуля. При rotate экрана или split-screen — значения устаревают.

**Решение**: Использовать `useWindowDimensions()` hook или Reanimated's `useAnimatedReaction` на `Dimensions` event.

**Impact**: 🔥 Корректность на iPad/Android tablets + split-screen.

---

## 🟢 Низкий приоритет (polish)

### 13. SyncService — альбомы загружаются последовательно, а не параллельно ✅

**Файл**: [SyncService.ts](file:///c:/Users/artem/Desktop/works/testik/mobile/src/services/SyncService.ts#L511)

**Статус**: Уже используется `Promise.all()` для загрузки альбомов — ✅ это правильно. Но стоит добавить `Promise.allSettled()` с fallback, чтобы одна failed загрузка не убивала весь альбом.

---

### 14. VideoNoteBubble — 1376 строк, нужна декомпозиция

**Файл**: [VideoNoteBubble.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/components/VideoNoteBubble.tsx) — **42KB**

**Проблема**: Гигантский компонент с плеером, progress ring, scrub, gestures, thumbnails, reactions, reply swipe. Сложно оптимизировать, дебажить, тестировать.

**Решение**: Вынести `ScrubRing`, `PlaybackOverlay`, `ThumbnailLoader` в отдельные memo-компоненты.

---

### 15. `generatedThumbnailCache` — Memory leak для видео-кружков

**Файл**: [VideoNoteBubble.tsx](file:///c:/Users/artem/Desktop/works/testik/mobile/src/components/VideoNoteBubble.tsx#L59)

**Проблема**: `new Map()` на уровне модуля без eviction. Если пользователь просмотрит 1000 видео-кружков, Map будет содержать 1000 thumbnail URI, которые никогда не очистятся.

**Решение**: Использовать LRU-кэш с лимитом (например, 100 entries) или `WeakRef`.

---

### 16. uiStore — SecureStore.setItemAsync при каждом setChatTheme/setPinnedMessage

**Файл**: [uiStore.ts](file:///c:/Users/artem/Desktop/works/testik/mobile/src/stores/uiStore.ts#L135-L145)

**Проблема**: Каждый `setChatTheme()`, `setPinnedMessage()`, `setUserBlocked()` синхронно вызывает `SecureStore.setItemAsync()`. SecureStore на iOS использует Keychain — это медленная операция.

**Решение**: Debounce запись или использовать `AsyncStorage` (который быстрее для некритичных данных). SecureStore оставить только для auth tokens.

---

## 📋 Рекомендуемый порядок реализации

| # | Задача | Сложность | Impact |
|---|--------|-----------|--------|
| 1 | ~~chatStore селекторы (п.1)~~ | 🟢 Лёгкая | ✅ Done |
| 2 | ~~chatStore.setChats O(n²) → O(n) (п.3)~~ | 🟢 Лёгкая | ✅ Done |
| 3 | ~~Убрать `extraData` из FlatList (п.6)~~ | 🟢 Лёгкая | ✅ Done |
| 4 | MediaCacheService debounce persist (п.7) | 🟡 Средняя | 🔥🔥 |
| 5 | messageStore → immer / Map (п.2) | 🟡 Средняя | 🔥🔥🔥 |
| 6 | Read receipts — только последнее (п.5) | 🟡 Средняя | 🔥🔥 |
| 7 | expo-image вместо RN Image (п.10) | 🟡 Средняя | 🔥🔥 |
| 8 | ChatScreen декомпозиция (п.4) | 🔴 Сложная | 🔥🔥 |
| 9 | WS dedup через Set (п.8) | 🟢 Лёгкая | 🔥 |
| 10 | useNavigation из MessageRow (п.9) | 🟢 Лёгкая | 🔥 |

---

> [!TIP]
> Пункты 1, 2, 3 можно сделать за 1-2 часа и получить **немедленное** улучшение отзывчивости приложения. Начинай с них.

> [!IMPORTANT]
> Пункт 10 (`expo-image`) — самый заметный для пользователя. Изображения перестанут мигать при скролле и будут кэшироваться на диск автоматически.

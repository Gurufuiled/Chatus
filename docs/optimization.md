# Оптимизация мобильного клиента

## Зачем мы это делали

Основная цель оптимизации была не просто "сделать код красивее", а уменьшить лишние перерисовки и подготовить экран чата и профиль к дальнейшему Telegram-like полишу без просадки FPS.

Главные проблемы до оптимизации:
- `ChatScreen.tsx` был слишком перегружен и держал слишком много UI-слоев в одном месте.
- `InputBar.tsx` рос в гигантский компонент со слишком большим количеством обязанностей.
- глобальное состояние проигрывания голосовых могло дергать слишком широкую часть дерева React.
- список чатов и профиль могли ререндериться шире, чем нужно.

## Что сделали по итогу

### 1. Разгрузили `ChatScreen`

Из монолитного экрана чата были вынесены отдельные UI-слои:

- `mobile/src/components/ChatMessageList.tsx`
  - держит `FlatList`
  - рендерит строки сообщений
  - содержит swipe-to-reply
  - изолирует тяжелый список от остального экрана

- `mobile/src/components/ChatTopBanners.tsx`
  - верхние баннеры чата
  - selection mode
  - pinned banner
  - search mode
  - верхняя плашка проигрывания голосового

- `mobile/src/components/ChatContextMenuOverlay.tsx`
  - long-press overlay
  - blur/backdrop
  - preview сообщения
  - reactions
  - action menu

- `mobile/src/components/ChatInputDock.tsx`
  - нижняя зона чата
  - composer shell
  - reply block
  - input + keyboard-following layout

- `mobile/src/components/ChatForwardSheet.tsx`
  - sheet для пересылки сообщений
  - список чатов-целей
  - empty-state и закрытие по backdrop

- `mobile/src/screens/chatScreen.shared.tsx`
  - общие константы
  - helper-функции
  - форматтеры
  - фон чата
  - мелкие pure-утилиты, которые не должны жить в самом экране

Что это дало:
- `ChatScreen.tsx` стал orchestration-layer, а не огромным UI-монолитом.
- стало проще изолировать рендеры и безопасно полировать UI дальше.

### 2. Поджали voice subsystem

Были оптимизированы:

- `mobile/src/services/VoicePlayerService.ts`
- `mobile/src/contexts/VoicePlayerContext.tsx`
- `mobile/src/components/VoiceBubble.tsx`

Что изменили:
- состояние проигрывания перестало бессмысленно ререндерить слишком большую часть дерева.
- подписка на playback стала уже и ближе к конкретному `uri`.
- `VoiceBubble` переведен на более локальную подписку.
- waveform и related-вычисления стали стабильнее и дешевле.

Что это дало:
- меньше лишних ререндеров во время проигрывания голосовых.
- более безопасная база для дальнейшего полиша голосовых.

### 3. Разгрузили `InputBar`

Из `InputBar.tsx` были вынесены тяжелые подслои:

- `mobile/src/components/InputAttachmentSheet.tsx`
  - attachment sheet
  - галерея
  - файл-вложение
  - отдельный memo-слой вместо большого inline-блока

- `mobile/src/components/InputVoiceRecordingStage.tsx`
  - UI режима записи голосового
  - таймер записи
  - визуальное состояние записи
  - отдельный runtime-блок вместо хранения всего внутри `InputBar`

Что это дало:
- `InputBar.tsx` стал заметно легче по ответственности.
- attachment/gallery и recording UI теперь можно оптимизировать и полировать отдельно.
- таймеры и visual-state записи перестали загрязнять весь composer.

### 4. Оптимизировали список чатов

Добавлен новый компонент:

- `mobile/src/components/ChatListRow.tsx`
  - отдельная memo-строка списка чатов
  - локальная подписка на данные конкретного чата
  - изоляция preview/last-message от всего экрана списка

Что было изменено:
- `mobile/src/screens/ChatListScreen.tsx`

Что это дало:
- экран списка чатов перестал подписываться слишком широко.
- новые сообщения меньше провоцируют лишние ререндеры всего списка.

### 5. Оптимизировали call flow

Был поджат:

- `mobile/src/contexts/CallContext.tsx`

Что изменили:
- секундный тик активного звонка был вынесен из широкого provider-пути.
- overlay звонка стал более изолированным.

Что это дало:
- активный звонок меньше дергает лишние части приложения.

### 6. Разбили `ChatProfileScreen`

Профиль собеседника тоже был разделен на крупные смысловые блоки:

- `mobile/src/components/ChatProfileHero.tsx`
  - верхний hero-блок профиля
  - аватар
  - имя
  - статус
  - quick actions
  - раскрытие аватарки

- `mobile/src/components/ChatProfileMediaSection.tsx`
  - вкладки профиля
  - `Медиа / Файлы / Голосовые / Ссылки`
  - grid/list rendering
  - локальные memo-подкомпоненты для tab-content

- `mobile/src/components/ChatProfileOverlayLayer.tsx`
  - overlay-слой профиля
  - fullscreen viewer
  - `Показать в чате`
  - `More` menu

Что было сделано с самим экраном:
- `mobile/src/screens/ChatProfileScreen.tsx` очищен от старых inline tabs, legacy overlay-блоков и мертвых стилей.
- экран снова стал orchestration-слоем, а не гигантским mixed UI file.

## Какие файлы были добавлены в ходе оптимизации

- `mobile/src/components/ChatMessageList.tsx`
- `mobile/src/components/ChatTopBanners.tsx`
- `mobile/src/components/ChatContextMenuOverlay.tsx`
- `mobile/src/components/ChatInputDock.tsx`
- `mobile/src/components/ChatForwardSheet.tsx`
- `mobile/src/screens/chatScreen.shared.tsx`
- `mobile/src/components/InputAttachmentSheet.tsx`
- `mobile/src/components/InputVoiceRecordingStage.tsx`
- `mobile/src/components/ChatListRow.tsx`
- `mobile/src/components/ChatProfileHero.tsx`
- `mobile/src/components/ChatProfileMediaSection.tsx`
- `mobile/src/components/ChatProfileOverlayLayer.tsx`

## Какие существующие файлы были существенно переработаны

- `mobile/src/screens/ChatScreen.tsx`
- `mobile/src/components/InputBar.tsx`
- `mobile/src/components/VoiceBubble.tsx`
- `mobile/src/contexts/VoicePlayerContext.tsx`
- `mobile/src/services/VoicePlayerService.ts`
- `mobile/src/screens/ChatListScreen.tsx`
- `mobile/src/contexts/CallContext.tsx`
- `mobile/src/screens/ChatProfileScreen.tsx`
- `mobile/src/components/index.ts`

## Что это дает проекту

- легче отслеживать реальные FPS-hotspots
- проще локально использовать `memo`
- меньше шанс случайно сломать чат одним изменением
- легче продолжать полировать анимации и микровзаимодействия
- проще переносить экранный код в будущую P2P/decoupled архитектуру без giant-components

## Что еще остается как следующий этап

1. Проверять on-device FPS после каждого крупного UX-изменения.
2. Дочищать старые mojibake-строки там, где они еще встречаются.
3. При необходимости дальше изолировать remaining hot-spots внутри `InputBar` и voice-record flow.
4. После стабилизации — уже безопаснее усиливать сложные анимации и более тяжелые визуальные эффекты.

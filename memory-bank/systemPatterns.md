# System patterns

## Слои
- **Rust**: единственный источник истины для данных и транспорта; SQLite через rusqlite.
- **RN**: экраны, компоненты, Zustand-сторы; вызовы в Rust через uniffi bridge (`mobile/src/bridge` и автогенерация).

## Навигация и состояние
- React Navigation 7 для табов и стеков.
- Zustand для auth, чатов, сообщений, UI.

## Иконки Telegram (Android drawable → RN)
- Векторные пути из Telegram Android вынесены в `mobile/src/icons/telegram/` (`TelegramGlyph`, `*Paths.ts`).
- Скрипты извлечения: `scripts/extract-telegram-tab-paths.mjs`, `scripts/extract-telegram-profile-settings-paths.mjs`.
- Документация соответствий: `docs/telegram-icon-source-map.md`, `docs/telegram-icon-divergences.md`.

## Жесты и медиа (RN)
- **Reanimated + Gesture Handler** для сложных жестов.
- **Важно (Reanimated Worklets)**: обработчики жестов, помеченные как worklet / выполняющиеся на UI thread, не должны синхронно вызывать обычные JS/React callbacks. Геометрию hit-test и угол→progress выносить в top-level функции с `'worklet'`, переход на JS только через `runOnJS`.
- **Video note (`VideoNoteBubble`)**: круговой прогресс (SVG), thumb-only scrubbing, композиция с reply-swipe через `Gesture.Exclusive`; глобальное состояние воспроизведения для баннеров — через модульные снапшоты/`useSyncExternalStore` в том же файле.
- **Чат-лист**: при активном video note ослаблена агрессивная виртуализация списка, чтобы плеер не «отваливался» при скролле (см. `ChatMessageList`).

## Профили
- Пользователь и группа: медиа viewer со swipe-to-close; в группах — разделение медиа (в т.ч. обычное видео) и секции голосовых с video_note.

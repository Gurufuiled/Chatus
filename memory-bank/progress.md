# Progress

## Что уже сделано (клиент RN, по недавней работе)
- Слой иконок Telegram (`TelegramGlyph`, пути из Android vector), табы/профиль/настройки; документация в `docs/telegram-icon-*.md`.
- Экран настроек: профиль сверху, иконочные ряды.
- Групповой профиль: убрана лишняя compact sticky-панель; sticky-табы; медиа/файлы/голосовые с long-press; видео в «Медиа», video_note в «Голосовые»; viewer со swipe-to-close.
- Чат: video note — круговой прогресс, баннеры, ослабление виртуализации при активном кружке; reply preview «Видеосообщение» для video_note.
- **Исправление runtime**: ошибка `[Worklets] Tried to synchronously call a non-worklet...` при scrub — вынесена worklet-safe геометрия в `VideoNoteBubble`.

## Что в работе / техдолг
- Автотесты на жесты video note (если появится стабильный harness) — пока ручная QA.
- Миграции с устаревших API (expo-av, ImagePicker, InteractionManager) — по плану SDK/рефакторинга.

## Известные ограничения
- Файл `.cursorrules` в корне может отсутствовать — паттерны фиксируются в `.cursor/rules/*.mdc` и в `memory-bank/`.

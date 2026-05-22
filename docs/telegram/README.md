# Telegram (TDLib) в Chatus — документация

Папка фиксирует **пробелы и планы** для ветки Telegram в клиенте `mobile/`: экраны на TDLib, переиспользование UI Chatus где возможно.

**Не путать с:**

- нативным чатом Chatus (`ChatScreen`, WebSocket, SQLite) — см. `docs/p2p/`;
- каналом на **сервере Chatus** (`ChannelFeedScreen`) — отдельный продуктовый контур;
- общим планом UI-паритета — [../tasks/telegram-chat-ui-parity.md](../tasks/telegram-chat-ui-parity.md).

## Файлы

| Файл | Содержание |
|------|------------|
| [gaps-vs-chatus-chat.md](./gaps-vs-chatus-chat.md) | Что **уже есть** в Chatus-чате и **чего нет** (или слабо) в Telegram-чате и **Telegram-канале** |
| [roadmap-priority.md](./roadmap-priority.md) | Приоритеты P0–P3 и рекомендуемый порядок спринтов |

## Ключевые файлы кода

| Область | Путь |
|---------|------|
| Экран чата | `mobile/src/screens/TelegramChatScreen.tsx` |
| Профиль TG | `mobile/src/screens/TelegramChatProfileScreen.tsx` |
| Меню сообщения | `mobile/src/screens/telegramChat/useTelegramChatMenu.tsx` |
| Маппинг TDLib | `mobile/src/screens/telegramChat/tdlibMapping.ts` |
| Эталон Chatus | `mobile/src/screens/ChatScreen.tsx` |
| Канал Chatus (сервер) | `mobile/src/screens/ChannelFeedScreen.tsx` |
| Композер | `mobile/src/components/InputBar.tsx` |

## Статус

Документы описывают состояние кодовой базы на момент составления; при закрытии пункта — обновлять чеклисты в `gaps-vs-chatus-chat.md`.

**Рисование на фото** в шторке галереи пока **нигде не сделано** (ни Chatus-чат, ни Telegram) — только в `gallery_editor_plan.md`; в матрице пробелов TG это не «отставание от Chatus».

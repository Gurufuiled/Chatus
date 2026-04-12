# Active context

## Текущий фокус (последние изменения)
- **Видеокружки в чате** (`VideoNoteBubble`): Telegram-подобный UI кольца прогресса и thumb; scrubbing только с бегунка; композиция жестов со swipe-to-reply; исправление краша Worklets (не вызывать non-worklet функции из UI thread — геометрия в worklet helpers + `runOnJS` для состояния).
- **Reply preview**: для `video_note` в превью ответа используется подпись «Видеосообщение» (`ReplyPreview`).
- **Память сессии**: ранее — слой иконок Telegram, настройки/профили, групповой профиль (медиа, long-press, viewer).

## Решения и ограничения
- Жесты video note и reply не должны конфликтовать: приоритет у scrub при захвате с thumb.
- Виртуализация списка сообщений учитывает активное видео (см. `ChatMessageList` + проп `activeVideoNoteVisible`).

## Следующие шаги (по желанию)
- Ручная проверка на устройстве: thumb scrub, скролл чата, reply swipe после фикса Worklets.
- Продолжить техдолг по предупреждениям сборки (expo-av, MediaTypeOptions, InteractionManager) точечно в затронутых экранах.

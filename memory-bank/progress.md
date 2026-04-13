# Progress

## Latest Video Call Progress
- [x] Video call mode added to `CallContext` with `callKind: audio | video`.
- [x] Local and remote WebRTC video streams render through `RTCView` in the call overlay.
- [x] Peer profile now has a separate `Видео` quick action for starting a video call.
- [x] Existing in-call `Видео` control now toggles local camera and sends renegotiation offers.
- [x] Signaling offer payloads now relay `call_type` through mobile and server.
- [x] Fixed mojibake in the visible peer-profile video quick-action label and video-call start error alert.
- [ ] Manual two-device/two-account QA for outgoing video calls, incoming video calls, and enabling/disabling video during an active audio call.

## Что уже сделано (клиент RN, по недавней работе)
- Слой иконок Telegram (`TelegramGlyph`, пути из Android vector), табы/профиль/настройки; документация в `docs/telegram-icon-*.md`.
- Экран настроек: профиль сверху, иконочные ряды.
- Групповой профиль: убрана лишняя compact sticky-панель; sticky-табы; медиа/файлы/голосовые с long-press; видео в «Медиа», video_note в «Голосовые»; viewer со swipe-to-close.
- Чат: video note — круговой прогресс, баннеры, ослабление виртуализации при активном кружке; reply preview «Видеосообщение» для video_note.
- **Исправление runtime**: ошибка `[Worklets] Tried to synchronously call a non-worklet...` при scrub — вынесена worklet-safe геометрия в `VideoNoteBubble`.
- **Звонки**: экран звонка в `CallContext` переделан в fullscreen Telegram-подобный overlay; нижние actions сведены в единый ряд, добавлен Android speaker toggle, disabled `Видео`, и responsive compact-layout для узких экранов.
- **Честный state controls**: `mute` теперь зависит от `isLocalAudioReady`, поэтому не выглядит рабочим до фактического поднятия локального аудио.

## Что в работе / техдолг
- Автотесты на жесты video note (если появится стабильный harness) — пока ручная QA.
- Миграции с устаревших API (expo-av, ImagePicker, InteractionManager) — по плану SDK/рефакторинга.
- Ручная QA экрана звонка на реальных устройствах и разных плотностях/ширинах экрана.

## Известные ограничения
- Файл `.cursorrules` в корне может отсутствовать — паттерны фиксируются в `.cursor/rules/*.mdc` и в `memory-bank/`.

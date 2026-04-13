# Active context

## Latest Video Call Update
- Video calls are now implemented in the current client/signaling path instead of being a disabled placeholder.
- `CallContext` now carries `callKind: audio | video`, local/remote RTC stream URLs, `RTCView` rendering, and local video toggle state.
- Starting a video call is available from the peer profile through a separate `Видео` quick action next to `Звонок`.
- The in-call `Видео` button now enables/disables local camera and sends a WebRTC renegotiation offer to the peer.
- Signaling offer payloads now include `call_type`; repeated offers from the same peer during an active call are treated as media renegotiation rather than busy state.
- Follow-up fix: the peer-profile video quick-action label and video-call start error alert were repaired after mojibake appeared in the visible Russian UI strings.
- Needs manual QA on two devices/accounts for camera permission prompts, outgoing video calls, incoming video calls, and enabling video during an existing audio call.

## Текущий фокус (последние изменения)
- **Звонки (`CallContext`)**: UI звонка переделан из белой карточки в fullscreen Telegram-подобный overlay с тёмной сценой, крупным аватаром и единым нижним блоком действий.
- **Call controls**: `динамик`, `видео`, `микрофон`, `завершить/отменить` собраны в один ряд для не-incoming фаз; для узких экранов добавлен responsive compact-layout, чтобы ряд не ломался.
- **Call state truthfulness**: `mute` честно disabled до поднятия локального аудиопотока (`isLocalAudioReady`), speaker toggle реализован на Android через `Audio.setAudioModeAsync`.

## Решения и ограничения
- Видеозвонки уже заведены в текущем client/signaling path, но требуют ручной QA на двух устройствах; Telegram-подобный layout in-call controls при этом должен оставаться визуально консистентным.
- Переключение `Динамик` в текущей реализации поддерживается только на Android; на других платформах control должен выглядеть disabled, а не “активным”.
- Для звонков важна честность control-state: если локальный stream ещё не создан, `Микрофон` не должен выглядеть рабочим.

## Следующие шаги (по желанию)
- Ручная проверка на устройстве: звонки в `incoming/outgoing/connecting/active`, особенно нижний control-row на реальных узких экранах.
- Продолжить техдолг по предупреждениям сборки, особенно вокруг `expo-av` в звонках и других медиа-сценариях.

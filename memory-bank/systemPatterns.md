# System patterns

## Latest Video Call Pattern
- Calls still live in `mobile/src/contexts/CallContext.tsx` as a provider-level fullscreen overlay, not a navigation screen.
- Audio and video calls share the same signaling channel; offer payloads carry `call_type` so the receiver can classify the call.
- Repeated offers from the same remote user during an active call are media renegotiation, not a new incoming call or busy condition.
- Local camera state is controlled by the in-call `Видео` action; toggling it adds/removes the local video track and sends a new offer.
- `RTCView` is used for remote full-screen video and local preview; when no remote video exists yet, local video can fill the stage.

## Слои
- **Rust**: единственный источник истины для данных и транспорта; SQLite через rusqlite.
- **RN**: экраны, компоненты, Zustand-сторы; вызовы в Rust через uniffi bridge (`mobile/src/bridge` и автогенерация).

## Навигация и состояние
- React Navigation 7 для табов и стеков.
- Zustand для auth, чатов, сообщений, UI.
- Звонки: текущий call UI живёт в `mobile/src/contexts/CallContext.tsx` как глобальный provider-level overlay (`Modal`), а не как отдельный navigation screen.

## Иконки Telegram (Android drawable → RN)
- Векторные пути из Telegram Android вынесены в `mobile/src/icons/telegram/` (`TelegramGlyph`, `*Paths.ts`).
- Скрипты извлечения: `scripts/extract-telegram-tab-paths.mjs`, `scripts/extract-telegram-profile-settings-paths.mjs`.
- Документация соответствий: `docs/telegram-icon-source-map.md`, `docs/telegram-icon-divergences.md`.

## Жесты и медиа (RN)
- **Reanimated + Gesture Handler** для сложных жестов.
- **Важно (Reanimated Worklets)**: обработчики жестов, помеченные как worklet / выполняющиеся на UI thread, не должны синхронно вызывать обычные JS/React callbacks. Геометрию hit-test и угол→progress выносить в top-level функции с `'worklet'`, переход на JS только через `runOnJS`.
- **Video note (`VideoNoteBubble`)**: круговой прогресс (SVG), thumb-only scrubbing, композиция с reply-swipe через `Gesture.Exclusive`; глобальное состояние воспроизведения для баннеров — через модульные снапшоты/`useSyncExternalStore` в том же файле.
- **Чат-лист**: при активном video note ослаблена агрессивная виртуализация списка, чтобы плеер не «отваливался» при скролле (см. `ChatMessageList`).

## Звонки (RN)
- `CallContext` хранит call-state и одновременно рендерит fullscreen overlay для `incoming/outgoing/connecting/active`.
- Для controls важно различать “визуально доступно” и “реально доступно”: `mute` привязан к состоянию готовности локального аудио (`isLocalAudioReady`), чтобы не было ложных no-op на ранних фазах.
- Telegram-подобный нижний блок действий должен оставаться единым рядом для обычных экранов, но иметь responsive compact-layout на узких устройствах; выносить red hangup action в отдельную карточку не нужно.
- `speaker` переключается через `Audio.setAudioModeAsync`; Android поддерживается реально, на остальных платформах control должен явно выглядеть disabled.

## Профили
- Пользователь и группа: медиа viewer со swipe-to-close; в группах — разделение медиа (в т.ч. обычное видео) и секции голосовых с video_note.

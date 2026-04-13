# Tech context

## Latest Video Call Tech Notes
- `react-native-webrtc` video is now used in calls via `RTCView`.
- `CallContext` keeps local/remote stream URLs in UI state so `RTCView` re-renders when tracks arrive or local video toggles.
- `mediaDevices.getUserMedia({ audio: true, video: ... })` starts video calls; audio-only calls can later request a video track and renegotiate.
- `SignalingService.sendOffer` accepts `callType: 'audio' | 'video'`; `server/src/signaling/signaling.gateway.ts` relays it as `call_type`.
- Validation after implementation:
  - `mobile`: `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit`
  - `server`: `npm run build`
- Follow-up UI-string fix touched `ChatProfileHero.tsx` and `ChatProfileScreen.tsx`; mobile typecheck still passes after the mojibake repair.

## Клиент (React Native)
- React Native ~0.83, Expo ~55, TypeScript ~5.9, React ~19.2.
- Zustand, React Navigation 7, Reanimated, react-native-gesture-handler.
- Медиа: expo-video, expo-video-thumbnails, expo-camera и др. по задачам.
- Звонки: `react-native-webrtc` + `expo-av` (`Audio.setAudioModeAsync`) для текущего голосового call-flow и переключения audio route.
- **SQLite в RN (expo-sqlite) не используется** — БД в Rust.

## Ядро (Rust)
- rusqlite (bundled), tokio, tokio-tungstenite, reqwest, webrtc-rs, uniffi, serde, uuid, thiserror и др. (см. `.cursor/rules/project.mdc`).

## Инструменты разработки
- Typecheck: `npx tsc --noEmit` в каталоге `mobile`. На больших проектах при OOM Node: `NODE_OPTIONS=--max-old-space-size=8192` (Windows PowerShell: `$env:NODE_OPTIONS='--max-old-space-size=8192'`).

## Зависимости с особыми нюансами
- `react-native-webrtc` может давать предупреждения про `event-target-shim` и `exports` — обычно от upstream, не блокер для клиентского кода.
- Устаревшие API: следить за предупреждениями `expo-av`, `ImagePicker.MediaTypeOptions`, `InteractionManager` — по мере миграции на `expo-audio`/`expo-video` и новые API.
- В звонках `expo-av` пока всё ещё используется для audio mode; это рабочее текущее решение, но часть техдолга на будущее.

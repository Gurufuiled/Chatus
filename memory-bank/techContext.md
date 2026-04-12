# Tech context

## Клиент (React Native)
- React Native ~0.83, Expo ~55, TypeScript ~5.9, React ~19.2.
- Zustand, React Navigation 7, Reanimated, react-native-gesture-handler.
- Медиа: expo-video, expo-video-thumbnails, expo-camera и др. по задачам.
- **SQLite в RN (expo-sqlite) не используется** — БД в Rust.

## Ядро (Rust)
- rusqlite (bundled), tokio, tokio-tungstenite, reqwest, webrtc-rs, uniffi, serde, uuid, thiserror и др. (см. `.cursor/rules/project.mdc`).

## Инструменты разработки
- Typecheck: `npx tsc --noEmit` в каталоге `mobile`. На больших проектах при OOM Node: `NODE_OPTIONS=--max-old-space-size=8192` (Windows PowerShell: `$env:NODE_OPTIONS='--max-old-space-size=8192'`).

## Зависимости с особыми нюансами
- `react-native-webrtc` может давать предупреждения про `event-target-shim` и `exports` — обычно от upstream, не блокер для клиентского кода.
- Устаревшие API: следить за предупреждениями `expo-av`, `ImagePicker.MediaTypeOptions`, `InteractionManager` — по мере миграции на `expo-audio`/`expo-video` и новые API.

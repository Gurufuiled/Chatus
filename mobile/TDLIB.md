# TDLib / Telegram API в Chatus

## Ключи my.telegram.org

Не коммить `api_hash` в открытый репозиторий.

### Локальная сборка (`expo run:android`, Metro)

В `mobile/.env` или `mobile/.env.production` (при `MOBILE_ENV=production`):

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash_here
```

`app.config.js` кладёт их в `expo.extra` как `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` (не префикс `EXPO_PUBLIC_`).

### EAS Build

1. В [Expo](https://expo.dev) → проект → **Environment variables** или **Secrets** задай `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` для профиля **production**.
2. В `mobile/eas.json` в `build.production.env` можно оставить пустые строки-заглушки — значения из дашборда Expo подставятся при сборке.

### GitHub Actions (`EAS Android APK → GitHub Release`)

В репозитории **Secrets** добавь `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` (как для EAS). Workflow передаёт их в окружение шага `eas build`.

## Android: настоящий TDLib (libtdjson)

1. Из папки **`mobile/`** один раз скачай нативные библиотеки (в git не входят, см. `.gitignore`):

   ```bash
   npm run tdlib:fetch-android
   ```

   Скрипт распаковывает архив в **`mobile/tdlib-android/jniLibs/`** (источник: [up9cloud/android-libtdjson](https://github.com/up9cloud/android-libtdjson), сейчас тег **v1.8.52** — см. `scripts/fetchTdlibAndroid.mjs`). Если в репозитории уже есть папка `android/`, те же `.so` копируются в `android/app/src/main/jniLibs/` для локальной сборки без `prebuild`.

2. При **`expo prebuild --platform android`** плагин **`withTdlibNative`** копирует в `android/` исходники из `tdlib-android/com`, `tdlib-android/io` и, если есть, **`tdlib-android/jniLibs`** → `android/app/src/main/jniLibs/`.

3. Поведение: `td_send` / `td_receive` в отдельном потоке; ответы на запросы с `@extra` резолвят Promise в `TdlibClient.send`; остальной JSON уходит в событие `td_json_update`.

4. **EAS Build:** в `package.json` добавлен хук **`eas-build-pre-install`**, который вызывает `fetchTdlibAndroid.mjs`, чтобы на билд-машине подтянуть `.so` до сборки нативного проекта.

## iOS

`ios/mobile/Tdlib.swift` + `TdlibBridge.m` — пока заглушка; для продакшена подключи XCFramework TDLib и тот же JSON-поток, что на Android.

## JS

- [`src/services/tdlib/TdlibClient.ts`](src/services/tdlib/TdlibClient.ts) — `tdlibClient.send({ '@type': '...' })`.
- [`src/stores/telegramAccountStore.ts`](src/stores/telegramAccountStore.ts) — локальное состояние сессии Telegram (SecureStore).

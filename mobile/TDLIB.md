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

## Нативный слой

- **Android:** `TdlibModule` / `TdlibPackage` (stub JSON в `mobile/tdlib-stub/`, копируются плагином `withTdlibNative` при `expo prebuild`). Для настоящего TDLib положи `libtdjson.so` в `android/app/jniLibs/{abi}/` и замени реализацию `sendClientJson` на вызов tdjson.
- **iOS:** `ios/mobile/Tdlib.swift` + `TdlibBridge.m` — тот же stub; позже подключи XCFramework TDLib.

## JS

- [`src/services/tdlib/TdlibClient.ts`](src/services/tdlib/TdlibClient.ts) — `tdlibClient.send({ '@type': '...' })`.
- [`src/stores/telegramAccountStore.ts`](src/stores/telegramAccountStore.ts) — локальное состояние сессии Telegram (SecureStore).

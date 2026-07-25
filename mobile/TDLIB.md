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

3. Поведение: **`td_receive`** в отдельном потоке `tdlib-receive`; **`td_send`** с потока RN (короткий `synchronized`), как допускает TDLib для `td_create_client_id` — чтобы приём не блокировался очередью отправки. Ответы с `@extra` резолвят Promise в `TdlibClient.send`; остальной JSON — `td_json_update`.

4. **EAS Build:** в `package.json` добавлен хук **`eas-build-pre-install`**, который на Android вызывает `fetchTdlibAndroid.mjs`, чтобы на билд-машине подтянуть `.so` до сборки нативного проекта.

## iOS

На iOS используется тот же React Native contract, что на Android:

- `NativeModules.Tdlib.sendClientJson(json)` → Promise с JSON-ответом TDLib.
- событие `td_json_update` → `{ json: string }`.
- ответы коррелируются по `@extra`, апдейты фильтруются тем же списком, что и Android/JS.

### Предсобранный XCFramework (рекомендуется)

Как на Android, TDLib для iOS можно **скачать готовым** — без cmake, OpenSSL и клонирования `tdlib/td` (~10 GB на диске при сборке из исходников).

Команда из `mobile/`:

```bash
npm run tdlib:build-ios
```

Скрипт `scripts/fetchTdlibIos.mjs`:

1. скачивает `libtdjson.xcframework.tar.gz` (~40 MB) из [up9cloud/ios-libtdjson](https://github.com/up9cloud/ios-libtdjson), тег **v1.8.52** (тот же поставщик prebuilt, что Android `up9cloud/android-libtdjson`; не официальный релиз Telegram);
2. кладёт результат в `mobile/tdlib-ios/libtdjson.xcframework`;
3. подтягивает заголовок `td_json_client.h` и stub `tdjson_export.h` в `mobile/tdlib-ios/include`.

Перезапись: `npm run tdlib:fetch-ios -- --force`.

### Сборка TDLib XCFramework из исходников (fallback)

Если нужен свой коммит TDLib или статическая линковка — только на macOS, через официальные скрипты `td/example/ios`.

Требования на macOS:

- полный Xcode, выбранный через `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`;
- Homebrew-зависимости из официального TDLib iOS README (`gperf`, `cmake`, `coreutils` и т.п.);
- `git`, `cmake`, `bash` в PATH;
- **~10+ GB свободного места** на диске (клон td + OpenSSL + артефакты сборки).

Команда из `mobile/`:

```bash
npm run tdlib:build-ios
```

Скрипт `scripts/buildTdlibIos.mjs`:

1. клонирует `tdlib/td` в `mobile/tdlib-ios/src/td` и переключается на закреплённый коммит **1.8.66** (`022d6020…`; у официального TDLib нет patch-тегов);
2. генерирует исходники TDLib через `cmake -DTD_GENERATE_SOURCE_FILES=ON`;
3. запускает `example/ios/build-openssl.sh`;
4. запускает `example/ios/build.sh`;
5. копирует результат в:
   - `mobile/tdlib-ios/libtdjson.xcframework`
   - `mobile/tdlib-ios/include`

Артефакты не коммитятся; в git остаются только:

- `tdlib-ios/TdLib.podspec`
- `tdlib-ios/native/Tdlib.swift`
- `tdlib-ios/native/TdlibBridge.m`

### Prebuild / Xcode

Плагин `plugins/withTdlibNative.js` при `expo prebuild --platform ios`:

- копирует Swift/ObjC bridge в `ios/mobile/`;
- добавляет local pod `TdLib` в `ios/Podfile`;
- добавляет `#import <td/telegram/td_json_client.h>` в bridging header;
- добавляет `Tdlib.swift` и `TdlibBridge.m` в Xcode target.

Fresh checkout на Mac перед любым `expo run:ios`, `pod install` или Xcode Archive:

```bash
npm ci
npm run tdlib:build-ios
npx expo prebuild --platform ios --clean
cd ios
pod install
open mobile.xcworkspace
```

### EAS Build iOS

`eas-build-pre-install` смотрит на `EAS_BUILD_PLATFORM`:

- `android` → `fetchTdlibAndroid.mjs`;
- `ios` → `fetchTdlibIos.mjs` (по умолчанию; `TDLIB_IOS_FROM_SOURCE=1` → `buildTdlibIos.mjs`).

Сборка из исходников на EAS не нужна: prebuilt ~40 MB скачивается за минуту.

## JS

- [`src/services/tdlib/TdlibClient.ts`](src/services/tdlib/TdlibClient.ts) — `tdlibClient.send({ '@type': '...' })`.
- [`src/stores/telegramAccountStore.ts`](src/stores/telegramAccountStore.ts) — локальное состояние сессии Telegram (SecureStore).

# Release iOS / TestFlight / App Store

Кратко: iOS release собирается либо через **EAS Build** в облаке, либо на **macOS + Xcode**. На Windows локально собрать `.ipa` нельзя. Для прод-сборки используется тот же механизм окружения, что и на Android: `MOBILE_ENV=production` подмешивает `mobile/.env.production` поверх `mobile/.env`.

---

## 1. Что нужно коллеге

- macOS + Xcode, если сборка локальная.
- Apple Developer Program с доступом к команде Chatus.
- Доступ к App Store Connect для TestFlight / релиза.
- `mobile/.env.production` с прод-переменными.
- `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` из `my.telegram.org`, если iOS Telegram включён.
- Для EAS: доступ к Expo-проекту и установленный `eas-cli`.

Устанавливай зависимости проекта целиком, а не отдельный пакет `expo`:

```bash
cd mobile
npm ci
```

Если `node_modules` уже сломан после попытки `npm install expo`, очисти установку:

```bash
cd mobile
rm -rf node_modules package-lock.json
git checkout -- package-lock.json
npm ci
```

---

## 2. Прод окружение

Файл: `mobile/.env.production` (не коммитится).

Минимум для iOS:

```env
EXPO_PUBLIC_API_URL=https://messenger.startapus.com/api
EXPO_PUBLIC_LOGINUS_CLIENT_ID=36bd25a329898885fd4b60c9f7b4f475
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_USE_EMULATOR=false

EXPO_PUBLIC_P2P_FIRST_ENABLED=true
EXPO_PUBLIC_P2P_PEER_ATTEMPT_TIMEOUT_MS=2500
EXPO_PUBLIC_WEBRTC_ICE_SERVERS_JSON="[{\"urls\":\"stun:stun.l.google.com:19302\"}]"

EXPO_PUBLIC_CLIENT_UPDATE_DISABLED=true
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://messenger.startapus.com/privacy-policy

TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

Для App Store / TestFlight не добавляй `EXPO_PUBLIC_CLIENT_UPDATE_APK_URL`. `EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL` тоже лучше не добавлять в iOS env; если он остался в общем EAS production-профиле, он безопасен только при `EXPO_PUBLIC_CLIENT_UPDATE_DISABLED=true` и без APK URL.

---

## 3. Проверить конфиг перед сборкой

В `mobile/app.json`:

- `expo.version` — публичная версия приложения.
- `expo.ios.bundleIdentifier` — должен быть `com.chatus.app`.
- `expo.ios.buildNumber` — обязательно добавить и увеличивать на каждый TestFlight / App Store build (`eas.json` использует `appVersionSource: "local"`).
- `expo.plugins[expo-build-properties].ios.deploymentTarget` — сейчас `15.1`.
- `expo.scheme` — `messenger` и `chatus`, нужны для Loginus/deep links.

Пример поля `buildNumber`:

```json
{
  "expo": {
    "version": "1.0.10",
    "ios": {
      "bundleIdentifier": "com.chatus.app",
      "buildNumber": "10"
    }
  }
}
```

### 3.1 Обязательная проверка native iOS-проекта

В репозитории уже есть `mobile/ios/`. EAS и Xcode будут собирать этот native-проект **как есть**, поэтому перед релизом обязательно синхронизируй его с `app.json`.

На момент написания в `mobile/ios/mobile.xcodeproj/project.pbxproj` могут оставаться старые значения:

- `PRODUCT_BUNDLE_IDENTIFIER = com.anonymous.mobile`
- `MARKETING_VERSION = 1.0.4`
- `CURRENT_PROJECT_VERSION = 5`

Для релиза это нужно исправить через clean prebuild или вручную в Xcode:

- Bundle Identifier: `com.chatus.app`.
- Version совпадает с `expo.version`.
- Build увеличен относительно предыдущего TestFlight build.
- Signing Team выбран из Apple Developer.

Рекомендуемый путь на macOS:

```bash
cd mobile
npm ci
npm run tdlib:build-ios
export MOBILE_ENV=production
npx expo prebuild --platform ios --clean
```

После этого открой `ios/mobile.xcworkspace` и ещё раз проверь Bundle ID / Version / Build / Signing.

### 3.2 Telegram / TDLib на iOS

В проекте добавлен настоящий iOS bridge под TDLib JSON API, но перед TestFlight/App Store на macOS нужно собрать и подключить сам `libtdjson.xcframework`.

Перед prebuild:

```bash
cd mobile
npm run tdlib:build-ios
```

После этого `expo prebuild --platform ios --clean` подключит local pod `TdLib` и скопирует Swift/ObjC bridge. Одних `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` недостаточно: без собранного XCFramework iOS Telegram не запустится.

---

## 4. Вариант A: EAS Build (рекомендуется)

Из `mobile/`:

```bash
npm ci
npx eas-cli login
```

Задать секреты в Expo Dashboard для production:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Проверить, что в `eas.json` для production есть:

```json
{
  "env": {
    "MOBILE_ENV": "production",
    "EXPO_PUBLIC_API_URL": "https://messenger.startapus.com/api",
    "EXPO_PUBLIC_CLIENT_UPDATE_DISABLED": "true"
  }
}
```

Собрать iOS. `eas.json` уже задаёт `MOBILE_ENV=production`, поэтому отдельный inline env не нужен:

```bash
cd mobile
npx eas-cli build --platform ios --profile production
```

Если EAS спросит credentials:

- выбрать Apple Team;
- разрешить EAS управлять certificates/profiles, если нет ручной схемы подписи;
- Bundle ID: `com.chatus.app`.

После успешной сборки:

```bash
npx eas-cli submit --platform ios --profile production
```

Либо загрузить `.ipa` вручную через Transporter.

---

## 5. Вариант B: локально через Xcode

Только на macOS.

```bash
cd mobile
npm ci
export MOBILE_ENV=production
npx expo prebuild --platform ios --clean
cd ios
pod install
open mobile.xcworkspace
```

В Xcode:

1. Выбрать scheme `mobile`.
2. Target `mobile` → Signing & Capabilities.
3. Team: команда Apple Developer.
4. Bundle Identifier: `com.chatus.app`.
5. Version / Build: актуальные значения для релиза.
6. Device: `Any iOS Device (arm64)`.
7. Product → Archive.
8. Organizer → Distribute App → App Store Connect → Upload.

---

## 6. Loginus и deep links

Для iOS login callback использует схему:

```text
messenger://auth/callback
```

На сервере Loginus redirect должен оставаться:

```text
https://messenger.startapus.com/api/auth/callback
```

Backend после callback перенаправляет пользователя обратно в приложение через custom scheme. Схемы `messenger` и `chatus` уже указаны в `app.json`.

---

## 7. Privacy / permissions

В проекте уже есть `mobile/ios/mobile/PrivacyInfo.xcprivacy`.

`withIosProductionPlist` добавляет тексты разрешений:

- Camera — запись видеокружков и съёмка.
- Microphone — голосовые сообщения и видеокружки.
- Photos — выбор изображений и аватара.
- Photo add — сохранение изображений.
- Contacts — поиск друзей в Chatus и Telegram; проверь, что после prebuild в `Info.plist` есть `NSContactsUsageDescription`.

Перед App Store review проверь в App Store Connect:

- Privacy Policy URL: `https://messenger.startapus.com/privacy-policy`
- App Privacy: отметить фактический сбор данных. Не копировать автоматически из `PrivacyInfo.xcprivacy`; это разные формы Apple.
- Export Compliance: приложение использует HTTPS/WSS/WebRTC. Если используется только стандартное шифрование Apple/системных библиотек, обычно указывают exempt encryption; для автоматизации можно добавить в `app.json` `expo.ios.config.usesNonExemptEncryption=false` после подтверждения юристами/владельцем аккаунта.

---

## 8. Smoke test перед отправкой

На TestFlight-сборке проверить:

- открывается Loginus и возвращает в приложение;
- `https://messenger.startapus.com/api` доступен;
- WebSocket чата работает;
- signaling для звонков работает;
- Telegram на iOS реально логинится через TDLib, список чатов и история загружаются;
- выбор фото / камера / микрофон запрашивают понятные разрешения;
- контакты запрашивают понятное разрешение, если экран контактов доступен на iOS;
- push-уведомления приходят, если iOS push настроен в Apple/Expo.

---

## 9. Частые ошибки

- **Собрали без `MOBILE_ENV=production`:** приложение может взять dev `.env` и ходить на LAN IP.
- **Не задан `ios.buildNumber`:** App Store Connect отклонит повторную загрузку с тем же build.
- **Bundle ID не совпадает:** provisioning profile не подойдёт или приложение попадёт в другой App Store record.
- **Старый checked-in `ios/`:** EAS соберёт `com.anonymous.mobile` / старую версию, если не сделать prebuild или не поправить Xcode project.
- **Telegram env есть, но `npm run tdlib:build-ios` не выполнен:** iOS build не сможет подключить local pod `TdLib`.
- **`fatal: Remote branch v1.8.52 not found`:** у `tdlib/td` нет тега `v1.8.52` (только до `v1.8.0`). Обнови репозиторий до последнего `main` и снова `npm run tdlib:build-ios`. Если осталась битая папка после неудачного клона: `rm -rf mobile/tdlib-ios/src/td`, затем повтори сборку. Переопределение: `TDLIB_IOS_REF=<commit>` или `TDLIB_IOS_VERSION=1.8.52`.
- **Оставили APK update env:** для App Store не нужны ссылки на внешнее скачивание APK.

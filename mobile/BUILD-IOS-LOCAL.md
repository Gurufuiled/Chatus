# Локальная сборка iOS (Release без Metro)

Кратко: **Release**-сборка через `xcodebuild` **не требует Metro**. JavaScript бандлится на этапе Xcode (`Bundle React Native code and images` → `expo export:embed`) и попадает в `.app`.

**Debug**-сборка, наоборот, ставит `SKIP_BUNDLING=1` и ожидает запущенный Metro (`npm start` / `expo start`).

Прод-переменные (`EXPO_PUBLIC_API_URL`, `TELEGRAM_API_ID`, …) подмешиваются из `mobile/.env.production`, если при сборке задано **`MOBILE_ENV=production`** (см. `app.config.js`).

---

## 1. Что нужно

| Требование | Комментарий |
|------------|-------------|
| macOS + Xcode | Command Line Tools установлены |
| Node.js | Путь к `node` в `ios/.xcode.env` / `ios/.xcode.env.local` |
| CocoaPods | `pod install` в `mobile/ios/` |
| Apple ID (для физического iPhone) | Personal Team или корпоративная команда |
| `mobile/.env.production` | Не в git; скопировать из `.env.production.example` |

---

## 2. Первичная подготовка (один раз или после `git pull`)

Из корня репозитория:

```bash
cd mobile
npm ci
npm run tdlib:build-ios
cd ios
pod install
```

Файл `mobile/.env.production` (минимум для prod API и Telegram):

```env
EXPO_PUBLIC_API_URL=https://messenger.startapus.com/api
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_USE_EMULATOR=false

TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

Чтобы Xcode всегда бандлил с prod-окружением (даже при сборке из GUI), можно добавить в **`ios/.xcode.env.local`** (файл локальный, не в git):

```bash
export MOBILE_ENV=production
```

---

## 3. Почему Release работает без Metro

В `Chatus.xcodeproj` фаза **Bundle React Native code and images**:

- **Debug** → `SKIP_BUNDLING=1` → JS грузится с Metro (`localhost:8081`).
- **Release** → `SKIP_BUNDLING` не ставится → вызывается **`expo export:embed`**, бандл вшивается в `Chatus.app`.

Metro **не запускай** для Release. Достаточно `MOBILE_ENV=production` при `xcodebuild` (или в `.xcode.env.local`).

---

## 4. Сборка на симулятор (Release, без Metro)

### 4.1 Узнать симулятор

```bash
xcrun simctl list devices available | grep iPhone
```

Пример UDID: `F8D47DA8-E3D3-4DEE-92E4-6F4794CB3CD8` (iPhone 17 Pro).

### 4.2 Собрать

```bash
cd mobile/ios

MOBILE_ENV=production xcodebuild \
  -workspace Chatus.xcworkspace \
  -scheme Chatus \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build/DerivedData-Sim \
  build
```

Вместо имени можно указать UDID:

```bash
-destination 'id=F8D47DA8-E3D3-4DEE-92E4-6F4794CB3CD8'
```

Готовое приложение:

```text
mobile/ios/build/DerivedData-Sim/Build/Products/Release-iphonesimulator/Chatus.app
```

### 4.3 Установить и запустить на симуляторе

```bash
xcrun simctl boot 'F8D47DA8-E3D3-4DEE-92E4-6F4794CB3CD8' 2>/dev/null || true

xcrun simctl install booted \
  build/DerivedData-Sim/Build/Products/Release-iphonesimulator/Chatus.app

xcrun simctl launch booted com.chatus.app.dev
```

> **Bundle ID:** в dev-сборках сейчас `com.chatus.app.dev` (см. `ios/Chatus.xcodeproj`). Для App Store / TestFlight — `com.chatus.app`.

---

## 5. Сборка на физический iPhone (Release, без Metro)

### 5.1 Подготовка устройства

1. iPhone по USB к Mac.
2. **Настройки → Конфиденциальность и безопасность → Режим разработчика** — включён.
3. При первой установке: **Настройки → Основные → VPN и управление устройством** → доверить профилю разработчика.

### 5.2 Узнать UDID iPhone

```bash
xcrun xctrace list devices
# или
xcrun devicectl list devices
```

Пример: `00008101-000E30323C28001E`.

### 5.3 Подпись (Signing)

В `ios/Chatus.xcodeproj` для локальной разработки на личном Apple ID:

- **DEVELOPMENT_TEAM** — команда из Xcode (сейчас в проекте: `X6MZQ9MJ73`).
- **PRODUCT_BUNDLE_IDENTIFIER** — `com.chatus.app.dev` (если `com.chatus.app` занят другой командой).

При смене Apple ID открой `ios/Chatus.xcworkspace` в Xcode → target **Chatus** → **Signing & Capabilities** → выбери свою Team.

Флаги `-allowProvisioningUpdates` и `-allowProvisioningDeviceRegistration` ниже создают/обновляют provisioning profile автоматически.

### 5.4 Собрать

```bash
cd mobile/ios

MOBILE_ENV=production xcodebuild \
  -workspace Chatus.xcworkspace \
  -scheme Chatus \
  -configuration Release \
  -sdk iphoneos \
  -destination 'id=00008101-000E30323C28001E' \
  -derivedDataPath build/DerivedData-Device \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

Готовое приложение:

```text
mobile/ios/build/DerivedData-Device/Build/Products/Release-iphoneos/Chatus.app
```

### 5.5 Установить на iPhone

```bash
xcrun devicectl device install app \
  --device 00008101-000E30323C28001E \
  build/DerivedData-Device/Build/Products/Release-iphoneos/Chatus.app
```

Или перетащи `Chatus.app` в **Devices and Simulators** в Xcode (Window → Devices and Simulators).

---

## 6. Сборка через Xcode (GUI)

1. `open mobile/ios/Chatus.xcworkspace` (не `.xcodeproj`).
2. В `ios/.xcode.env.local` добавь `export MOBILE_ENV=production`.
3. Scheme **Chatus**, конфигурация **Release**.
4. Destination: симулятор или подключённый iPhone.
5. **Product → Build** (⌘B) или **Run** (⌘R).

Для Archive / TestFlight см. [RELEASE-IOS.md](./RELEASE-IOS.md).

---

## 7. Debug-сборка (с Metro) — для сравнения

Если нужна быстрая отладка с hot reload:

```bash
cd mobile
npm start          # Metro, терминал 1
npm run ios        # или expo run:ios, терминал 2
```

Или из Xcode: конфигурация **Debug** + запущенный Metro на `8081`.

---

## 8. Частые проблемы

| Симптом | Решение |
|---------|---------|
| Приложение ходит на LAN / dev API | Собрали без `MOBILE_ENV=production`. Пересобери Release с этой переменной или добавь её в `.xcode.env.local`. |
| `missing libtdjson.dylib` | `cd mobile && npm run tdlib:fetch-ios`, затем `pod install`, пересобери. |
| Crash при старте: `libtdjson.dylib` unsigned | В `Podfile` есть фаза `[TdLib] Embed libtdjson.dylib` с `codesign`. Выполни `pod install` и полную пересборку. |
| `HERMES_CLI_PATH` указывает на чужую машину | `Podfile` → `fix_hermes_cli_path`. `pod install` + clean build. |
| `No signing certificate` / provisioning | Xcode → Signing, выбери Team; для CLI добавь `-allowProvisioningUpdates`. |
| `com.chatus.app` недоступен для Personal Team | Используй `com.chatus.app.dev` или корпоративную команду. |
| Release на симуляторе — чёрный экран | Убедись, что конфигурация **Release**, а не Debug без Metro. |
| Telegram не логинится | Проверь `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` в `.env.production` и что `tdlib:fetch-ios` выполнен. |
| CocoaPods не находится | Укажи полный путь, напр. `~/.gem/ruby/2.6.0/bin/pod install`. |

### Очистка перед пересборкой

```bash
cd mobile/ios
rm -rf build/DerivedData-Sim build/DerivedData-Device
# при странных ошибках линковки:
# rm -rf ~/Library/Developer/Xcode/DerivedData/Chatus-*
```

---

## 9. Шпаргалка команд

**Симулятор Release (prod env):**

```bash
cd mobile/ios && MOBILE_ENV=production xcodebuild \
  -workspace Chatus.xcworkspace -scheme Chatus -configuration Release \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build/DerivedData-Sim build
```

**iPhone Release (prod env):**

```bash
cd mobile/ios && MOBILE_ENV=production xcodebuild \
  -workspace Chatus.xcworkspace -scheme Chatus -configuration Release \
  -sdk iphoneos -destination 'id=ВАШ_UDID' \
  -derivedDataPath build/DerivedData-Device \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

**Установка на iPhone:**

```bash
xcrun devicectl device install app --device ВАШ_UDID \
  build/DerivedData-Device/Build/Products/Release-iphoneos/Chatus.app
```

---

## 10. Связанные документы

- [RELEASE-IOS.md](./RELEASE-IOS.md) — TestFlight, App Store, EAS Build
- [TDLIB.md](./TDLIB.md) — Telegram / TDLib на iOS и Android
- [.env.production.example](./.env.production.example) — шаблон prod-переменных

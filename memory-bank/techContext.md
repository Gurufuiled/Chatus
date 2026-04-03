# Tech Context

## Recent Local Dev Notes (Apr 2026)
- Local Postgres for the dev server is currently expected at `127.0.0.1:55432`.
- The typical local flow is:
  - `cd server`
  - `docker compose up -d db`
  - then run Nest locally with `npm run start:dev`
- Phone/device LAN access to the API is separate from DB access:
  - mobile uses the host LAN IP such as `192.168.x.x`
  - Nest/Prisma still talks to Postgres on local `127.0.0.1:55432`

## Prisma Notes (Apr 2026)
- Forwarded-message work added these migrations:
  - `20260404000100_add_message_forward_metadata`
  - `20260404000200_add_message_forward_source_refs`
- If Prisma Client is generated with `--no-engine`, local runtime can start expecting `prisma://` / Accelerate-style datasource URLs.
- For this repo's local setup, Prisma Client should be regenerated normally with plain `npx prisma generate` so standard `postgresql://...` URLs continue to work.

## Recent Validation Notes (Apr 2026)
- `server` build passes after the forwarded-message metadata changes.
- `mobile` typecheck still passes after the latest chat/profile polish.
- Local Prisma connectivity was revalidated after regenerating the client and starting Docker Postgres.

## Стек

### Mobile (React Native + Expo)
- **Runtime:** React Native 0.83.2, Expo ~55, Hermes (обязателен)
- **Язык:** TypeScript 5.9
- **Состояние:** Zustand
- **Навигация:** React Navigation 7 (native-stack, bottom-tabs)
- **Медиа:** expo-camera, expo-av, expo-video, expo-image-picker, expo-document-picker
- **БД:** expo-sqlite (НЕ rusqlite — Rust Core пока не используется)
- **Сеть:** fetch, WebSocket (нативный), react-native-webrtc (P2P)
- **Хранение:** expo-secure-store (токены, id_token)
- **Патчи:** **patch-package** (`postinstall`) — навигация, **react-native**, **expo-av**, **expo-modules-core**, **react-native-screens**, webview, reanimated, worklets, netinfo, safe-area и др. (см. `mobile/patches/`)

### Server (NestJS)
- **Framework:** NestJS 11
- **БД:** PostgreSQL, Prisma 6
- **Auth:** JWT, Passport, Loginus OAuth (axios)
- **WebSocket:** @nestjs/websockets, ws
- **Порты:** 4000 (HTTP), 4001 (WS), 4002 (Signaling)

## Переменные окружения

### server/.env
- PORT, WS_PORT, SIGNALING_PORT
- DATABASE_URL (PostgreSQL)
- JWT_SECRET
- LOGINUS_BASE_URL, LOGINUS_CLIENT_ID, LOGINUS_CLIENT_SECRET
- LOGINUS_REDIRECT_URI, LOGINUS_REDIRECT_URI_LOGOUT, LOGINUS_REDIRECT_URI_EMULATOR

### mobile/.env
- Шаблон в репо: **`mobile/.env.example`** (прод API и Loginus id для команды; скопировать в **`mobile/.env`**).
- `EXPO_PUBLIC_API_URL` — прод: полный URL API (например `http://45.11.93.210:4000/api`); локально LAN или `localhost` с adb reverse
- `EXPO_PUBLIC_USE_EMULATOR` — для **AVD**: `true` (localhost/192.168.x тогда мапятся на `10.0.2.2`); для **релиза на телефон**, **iOS Simulator** и прод-VPS: `false`
- `EXPO_PUBLIC_USE_MOCKS`, `EXPO_PUBLIC_USE_P2P`
- `EXPO_PUBLIC_LOGINUS_CLIENT_ID` — публичный client id (secret только на сервере)

### mobile/app.config.js
- Дублирует значения из `.env` в **`expo.extra`**, чтобы в **release** (Hermes) стабильно попадали `EXPO_PUBLIC_*`: при сборке `process.env` может не инлайниться, из-за чего оставался `localhost` и на части устройств срабатывала подмена на `10.0.2.2` (эмулятор).
- `mobile/src/config.ts` читает **сначала** `Constants.expoConfig.extra`, затем `process.env`.

## Разработка
- **Android emulator:** `EXPO_PUBLIC_USE_EMULATOR=true` в `.env`; adb reverse для 8081, 4000, 4001, 4002 при необходимости
- **Физическое устройство (dev):** LAN IP или `localhost` + `npm run adb:reverse`
- **Релизный APK** (вшитый JS, без Metro): из `mobile/android` — `.\gradlew.bat assembleRelease`; артефакт `app/build/outputs/apk/release/app-release.apk`. Перед сборкой актуальный `mobile/.env`; при смене нативных плагинов — `npx expo prebuild --platform android`.
- **Скрипты:** `npm run adb:reverse`, `adb:reverse:emulator`, `adb:reverse:device`

## Git remotes (типично)
- **`corporate`** → **https://github.com/Startupus-Team/chatus.git** (`main`) — команда.
- **`origin`** → личный форк/зеркало (например **Gurufuiled/Chatus**); локальная ветка часто **`master`**, tracking **`origin/main`**.

## Деплой бэкенда (VPS)
- Корпоративный репозиторий: **https://github.com/Startupus-Team/chatus** (`main`).
- Типичный путь на сервере: `/root/chatus/server`; стек: **`docker compose up -d --build`** (Postgres + Nest API).
- У контейнера **`api`** поле **`DATABASE_URL`** задаётся в **`docker-compose.yml`** (хост `db`, пользователь `messenger`, пароль из `POSTGRES_PASSWORD`); строка `DATABASE_URL` в `.env` на хосте может быть черновой — для контейнера приоритет у переопределения compose.
- Порты снаружи: **4000** HTTP/API, **4001** WebSocket, **4002** signaling; **ufw** на хосте часто выключен — проверять ещё firewall панели хостинга.
- Loginus: в кабинете зарегистрированы `LOGINUS_REDIRECT_URI` и post-logout URL на тот же публичный хост API.

## iOS
- Тот же проект **`mobile/`**; в репозитории закоммичен **`mobile/ios/`** (Xcode + **CocoaPods**).
- На Mac: из **`mobile/`** — **`npm install`**, затем **`./open-in-xcode.sh`** (или вручную `pod install` в `ios/`, открыть **`mobile.xcworkspace`**) либо **`npx expo run:ios`**.
- **`app.json`** → `ios.infoPlist`: ATS-исключение для HTTP к VPS **`45.11.93.210`** (и при смене хоста — обновить).
- Раздача тестерам: **TestFlight** (нужен Apple Developer Program) или ad hoc; **EAS Build** — сборка iOS без своего Mac. APK с Android на iPhone не установить.
- **Shell:** `open-in-xcode.sh` — bash-скрипт автоматизации шагов под macOS.

## Ограничения
- Hermes обязателен (JSC убран в RN 0.83+)
- Патчи зависят от версий пакетов — после крупного `npm update` может понадобиться обновить патчи
- P2P отключён по умолчанию (`EXPO_PUBLIC_USE_P2P=false`)
- На некоторых Windows-машинах **`npx tsc --noEmit`** в `mobile` может упасть по **heap OOM** — не индикатор ошибок в коде; при необходимости увеличить лимит памяти Node

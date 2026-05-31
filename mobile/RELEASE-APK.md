# Release APK (прод) и деплой сервера

Кратко: **APK** ходит на URL из `EXPO_PUBLIC_*`. Для прод-сборки подключается **`mobile/.env.production`** (не в git), если задана переменная **`MOBILE_ENV=production`**. Бэкенд на VPS тянется из **корпоративного репозитория** и обычно поднимается через **Docker Compose**.

---

## 1. Мобильное приложение → прод API

### 1.1 Файлы окружения

| Файл | Назначение |
|------|------------|
| `mobile/.env` | Обычная разработка (LAN / локальный API) |
| `mobile/.env.production` | Оверлей для release: прод `EXPO_PUBLIC_API_URL` и флаги |

Создай прод-файл:

```bash
cd mobile
cp .env.production.example .env.production
```

Отредактируй `.env.production`: **`EXPO_PUBLIC_API_URL`** = `https://messenger.startapus.com/api` (прод с Traefik). WebSocket и signaling: **wss** на том же хосте, порты **4001** и **4002** (см. `mobile/src/config.ts`).

`app.config.js` подмешивает `.env.production` **только** при `MOBILE_ENV=production`, поверх значений из `.env`.

### 1.1.0 RuStore / Google Play

В **`.env.production`** для магазинов обязательно:

- `EXPO_PUBLIC_CLIENT_UPDATE_DISABLED=true` — не скачивать APK в обход магазина (`AppUpdateGate`).
- `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://messenger.startapus.com/privacy-policy` — ссылка с экрана входа.

На сервере должен открываться `GET /privacy-policy` (см. `server/public/privacy-policy.html`).

### 1.1.1 OTA: манифест и APK с публичного GitHub (Gurufuiled/Chatus)

Релизы APK и JSON манифеста живут в **публичном** репозитории, без VPS и без приватного org:

- **`EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL`** (в `.env.production`) =  
  `https://raw.githubusercontent.com/Gurufuiled/Chatus/main/config/client-update-manifest.json`  
  (после `git push` обновление видно клиентам; деплой API для этого не нужен.)
- В **`config/client-update-manifest.json`** поле **`apkUrl`** указывает на  
  `https://github.com/Gurufuiled/Chatus/releases/latest/download/chatus-release.apk` — загружай туда **`chatus-release.apk`** как артефакт релиза.

Перед выкладкой нового APK подними **`releaseTag`** в том же JSON и совмести с **`EXPO_PUBLIC_CLIENT_RELEASE_TAG`** при сборке (см. комментарии в примере `.env.production`).

### 1.1.2 APK с Google Drive (если с GitHub releases «скачка» глючит)

Папка для хранения сборок: [Chatus на Google Drive](https://drive.google.com/drive/folders/1wZpsToMkPvc0CHscSF4GAe007jChzxaO).

Манифест поддерживает два варианта ссылки на APK:

1. **`android.apkUrl`** — любой прямой `https://…` (как раньше).
2. **`android.driveApkFileId`** — только **ID файла** (не папки). После загрузки `chatus-release.apk` в папку: открой **файл** в Drive → «Настроить доступ» → «Все, у кого есть ссылка» (читатель) → скопируй ссылку вида  
   `https://drive.google.com/file/d/FILE_ID_HERE/view`  
   и в **`config/client-update-manifest.json`** добавь:

   ```json
   "driveApkFileId": "FILE_ID_HERE"
   ```

   Если `driveApkFileId` задан, приложение соберёт ссылку вида  
   `https://drive.google.com/uc?export=download&id=FILE_ID_HERE`  
   и **игнорирует** `apkUrl` для кнопки скачивания (можно оставить `apkUrl` как запасной GitHub для документации).

**Не путать:** `1wZpsToMkPvc0CHscSF4GAe007jChzxaO` из URL **папки** (`/folders/…`) — это **не** `driveApkFileId`; скачивание по нему даст не APK.

**Ограничения:** у Google для крупных файлов иногда показывается промежуточная страница «Подтвердить скачивание» — пользователь в браузере нажимает «Скачать всё равно». Для полностью автоматического потока без страниц провайдера — надёжнее раздавать APK **со своего VPS**.

**Запасной URL в сборке:** `EXPO_PUBLIC_CLIENT_UPDATE_APK_URL` в **`mobile/.env.production`** используется **только если** в манифесте нет рабочей ссылки на APK (пустой/битый блок `android`). Иначе **всегда** берётся URL из манифеста (`driveApkFileId` или `apkUrl`) — так старая сборка с вшитым GitHub в env не перекрывает Google Drive в JSON. Пересобери release с `MOBILE_ENV=production`, если меняешь env.

После правки JSON сделай **`git push`** в ветку, с которой тянется `EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL` (например `main` на raw.githubusercontent.com).

### 1.2.1 Версия в APK (важно для RuStore)

Меняй **одновременно**:

- `mobile/app.json` → `expo.version` и `expo.android.versionCode`
- `mobile/android/app/build.gradle` → `versionName` и `versionCode` (Gradle **не** подтягивает их из `app.json` автоматически при `assembleRelease`)

После смены версии: `npm run android:assembleRelease:prod`.

### 1.2 Сборка release APK (локально, Expo prebuild / Gradle)

Из каталога **`mobile/`** (один раз: `npm install`, чтобы подтянулся `cross-env`):

**Через npm-скрипт (Windows / macOS / Linux одинаково):**

```bash
npm run android:release:prod
```

**Вручную:**

**PowerShell (Windows):**

```powershell
$env:MOBILE_ENV = "production"
npx expo run:android --variant release
```

**bash (macOS / Linux):**

```bash
export MOBILE_ENV=production
npx expo run:android --variant release
```

APK обычно лежит в:

`mobile/android/app/build/outputs/apk/release/chatus-release.apk`

Первый раз может понадобиться:

```bash
cd mobile
npx expo prebuild --platform android
```

(если папки `android/` ещё нет).

### 1.3 Что проверить на устройстве

- В настройках телефона разрешён **HTTP** для приложения или используется **HTTPS** на сервере (`app.json` уже включает `usesCleartextTraffic` для Android через `expo-build-properties`).
- **Loginus**: redirect URI на сервере = `https://messenger.startapus.com/api/auth/callback` (как в `server/.env`), тот же стенд, что `EXPO_PUBLIC_API_URL` в `.env.production`.

---

## 2. Сервер на VPS (код с корпоративного Git)

Предполагается: на VPS уже есть клон репозитория и remote на корпоративный GitHub.

### 2.1 Подтянуть код

```bash
cd /path/to/chatus   # корень монорепо или только server — как у вас принято
git fetch corporate
git checkout master    # или main — как заведено в Startupus-Team/chatus
git pull corporate master
```

Если remote называется иначе:

```bash
git remote -v
git pull origin main
```

### 2.2 Обновить окружение на сервере

В **`server/.env`** на VPS (не коммитится):

- `DATABASE_URL` / `POSTGRES_PASSWORD` — боевые значения
- **`LOGINUS_REDIRECT_URI`** и **`LOGINUS_REDIRECT_URI_LOGOUT`** — `https://messenger.startapus.com/api/auth/callback` и `.../logout-done` (как в Loginus)
- **`PUBLIC_ORIGIN`** — `https://messenger.startapus.com` (опционально; иначе берётся из redirect URI)
- `JWT_SECRET`, `LOGINUS_CLIENT_SECRET` — сильные секреты
- **FCM (Android):** файл `server/firebase-service-account.json` на VPS (не в git). Скопируй с машины разработки, например:
  `scp server/firebase-service-account.json root@<VPS>:/root/chatus/server/`
  После деплоя в логах api должно быть `Firebase Admin SDK initialized for FCM push`.

Локальный шаблон без секретов: `server/.env.example`.

### 2.3 Деплой через Docker Compose (рекомендуется)

Из каталога **`server/`** на VPS:

```bash
cd server
docker compose pull   # если образы из registry; иначе пропусти
docker compose build --no-cache
docker compose up -d
docker compose logs -f api
```

Миграции Prisma выполняются при старте контейнера (`Dockerfile` CMD: `prisma migrate deploy`).

### 2.4 Порты

На VPS должны быть открыты (firewall / security group), при Traefik:

- **443** — HTTPS API  
- **4001** — WSS чата  
- **4002** — WSS signaling (звонки)  
- **80** — Let's Encrypt (HTTP challenge)

Postgres в `docker-compose.yml` проброшен на `127.0.0.1` — снаружи не торчит, это нормально.

---

## 3. Чеклист «всё сошлось»

1. `mobile/.env.production` → правильный `EXPO_PUBLIC_API_URL`  
2. Сборка с `MOBILE_ENV=production`  
3. На VPS `server/.env` → Loginus redirect = тот же хост, что видит телефон  
4. `docker compose up -d` после `git pull` с корпоративного remote  
5. С телефона: `https://messenger.startapus.com/api`, WSS на `:4001` и `:4002`

---

## 4. Вернуться на локальную разработку

- Не выставляй `MOBILE_ENV=production` — используется только `mobile/.env`  
- На сервере для локальных тестов снова включи LAN-редиректы в `server/.env` (как в комментариях у тебя в файле)

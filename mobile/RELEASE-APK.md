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

Отредактируй `.env.production`: **`EXPO_PUBLIC_API_URL`** = `http://<VPS_IP>:4000/api` (или HTTPS, если настроен). **Порт 4001** (WebSocket) и **4002** (signaling) должны быть доступны с телефона на тот же хост (см. `mobile/src/config.ts` — хост берётся из API URL).

`app.config.js` подмешивает `.env.production` **только** при `MOBILE_ENV=production`, поверх значений из `.env`.

### 1.1.1 OTA: манифест и APK с публичного GitHub (Gurufuiled/Chatus)

Релизы APK и JSON манифеста живут в **публичном** репозитории, без VPS и без приватного org:

- **`EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL`** (в `.env.production`) =  
  `https://raw.githubusercontent.com/Gurufuiled/Chatus/main/config/client-update-manifest.json`  
  (после `git push` обновление видно клиентам; деплой API для этого не нужен.)
- В **`config/client-update-manifest.json`** поле **`apkUrl`** указывает на  
  `https://github.com/Gurufuiled/Chatus/releases/latest/download/chatus-release.apk` — загружай туда **`chatus-release.apk`** как артефакт релиза.

Перед выкладкой нового APK подними **`releaseTag`** в том же JSON и совмести с **`EXPO_PUBLIC_CLIENT_RELEASE_TAG`** при сборке (см. комментарии в примере `.env.production`).

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
- **Loginus**: redirect URI на сервере = публичный URL VPS (`http://<VPS>:4000/api/auth/callback`), тот же стенд, что и у мобильного `EXPO_PUBLIC_API_URL`.

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
- **`LOGINUS_REDIRECT_URI`** и **`LOGINUS_REDIRECT_URI_LOGOUT`** — **публичный** `http://<VPS_IP>:4000/...` (см. комментарии в `server/.env.example`)
- `JWT_SECRET`, `LOGINUS_CLIENT_SECRET` — сильные секреты

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

На VPS должны быть открыты (firewall / security group):

- **4000** — HTTP API  
- **4001** — WebSocket чата  
- **4002** — signaling (P2P)

Postgres в `docker-compose.yml` проброшен на `127.0.0.1` — снаружи не торчит, это нормально.

---

## 3. Чеклист «всё сошлось»

1. `mobile/.env.production` → правильный `EXPO_PUBLIC_API_URL`  
2. Сборка с `MOBILE_ENV=production`  
3. На VPS `server/.env` → Loginus redirect = тот же хост, что видит телефон  
4. `docker compose up -d` после `git pull` с корпоративного remote  
5. Телефон в интернете достучится до `IP:4000`, `:4001`, `:4002`

---

## 4. Вернуться на локальную разработку

- Не выставляй `MOBILE_ENV=production` — используется только `mobile/.env`  
- На сервере для локальных тестов снова включи LAN-редиректы в `server/.env` (как в комментариях у тебя в файле)

# Деплой бэкенда на VPS (пошагово)

Контекст: монорепозиторий **chatus** на сервере в **`~/chatus`** (или `/root/chatus`). API поднимается через **Docker Compose** из каталога **`server/`**. На GitHub корпоративный репозиторий: **Startupus-Team/chatus**.

---

## 0. Перед первым деплоем (один раз)

1. На VPS установлены **Git**, **Docker**, **Docker Compose v2** (`docker compose`).
2. Репозиторий склонирован, remote **`origin`** указывает на корп. репо:
   ```bash
   cd ~/chatus
   git remote -v
   # origin  git@github.com:Startupus-Team/chatus.git
   ```
3. SSH-ключ на сервере добавлен в GitHub (deploy key или доступ пользователя).
4. В **`server/.env`** на VPS заданы боевые переменные (не коммитятся): `DATABASE_URL` / `POSTGRES_PASSWORD`, `JWT_SECRET`, Loginus, **`LOGINUS_REDIRECT_URI`** и **`LOGINUS_REDIRECT_URI_LOGOUT`** с **публичным IP/доменом** VPS. В кабинете Loginus те же redirect URI.

---

## 1. Подключиться к серверу

```bash
ssh root@<VPS_HOST>
```

(или свой пользователь и хост)

---

## 2. Перейти в корень репозитория

Корень — там, где лежит **`.git`** и папки **`mobile/`**, **`server/`**:

```bash
cd ~/chatus
# или
cd /root/chatus
```

Проверка:

```bash
git rev-parse --show-toplevel
```

---

## 3. Скачать свежие коммиты с GitHub

```bash
git fetch origin
```

Это **не меняет** рабочие файлы, только обновляет ссылки `origin/main`, `origin/master` и т.д.

---

## 4. Убедиться, что подтянута нужная ветка

Посмотреть текущую ветку:

```bash
git branch
git status
```

**Важно:** с ПК часто пушат в **`master`**, а на VPS рабочая ветка может быть **`main`**. Тогда `main` отстаёт от `origin/master`.

Проверка «есть ли на master то, чего нет на main»:

```bash
git log --oneline main..origin/master | head -20
```

- Пусто — деплой кода на `main` уже актуален относительно `master`.
- Есть коммиты — нужно влить `origin/master` в текущую ветку (см. шаг 5).

---

## 5. Обновить рабочую копию (влить код)

### Вариант A: работаешь на **main** и нужно подтянуть **master** с GitHub

```bash
git checkout main
git merge origin/master
```

(если настроен tracking и `main` чистый, иногда достаточно `git pull origin main` — но при расхождении `main`/`master` на GitHub надёжнее явный `merge origin/master`)

### Вариант B: на VPS решили вести только **master**

```bash
git fetch origin
git checkout -B master origin/master
```

### Вариант C: всё уже в **main** на GitHub

```bash
git checkout main
git pull origin main
```

После любого варианта: **без конфликтов** → переходи к шагу 6. При конфликтах — разрешить вручную, `git commit`, затем шаг 6.

---

## 6. Пересобрать и перезапустить контейнеры API

```bash
cd ~/chatus/server
docker compose build --no-cache
docker compose up -d
```

Миграции Prisma в этом проекте выполняются при старте контейнера (**`prisma migrate deploy`** в `Dockerfile` CMD).

---

## 7. Проверка

```bash
docker compose ps
docker compose logs api --tail=100
```

Убедиться, что контейнер **`api`** в состоянии **running**, в логах нет падения при старте и миграции прошли.

Порты снаружи (firewall): **4000** (HTTP), **4001** (WebSocket), **4002** (signaling).

---

## 8. Опционально: выровнять **main** на GitHub с сервером

Если на VPS сделали `merge origin/master` в локальный `main` и хотите, чтобы на GitHub **`main`** тоже указывал на тот же коммит:

```bash
cd ~/chatus
git push origin main
```

(нужны права на push и отсутствие защиты ветки, если она включена.)

---

## Краткая шпаргалка (повторяющийся деплой)

```bash
ssh root@<VPS>
cd ~/chatus
git fetch origin
git checkout main
git merge origin/master
cd server
docker compose build --no-cache && docker compose up -d
docker compose logs api --tail=50
```

Если пушите только в **`main`** на GitHub — замените merge на:

```bash
git pull origin main
```

---

## Связка с мобильным релизом

После успешного деплоя сервера можно собирать **release APK** с **`EXPO_PUBLIC_API_URL`** на этот же хост (см. `mobile/RELEASE-APK.md` и `mobile/.env.production.example`).

---

## Частые проблемы

| Симптом | Что проверить |
|--------|----------------|
| `fatal: 'corporate' does not appear...` | На VPS remote обычно **`origin`**, не `corporate`. Используй `git fetch origin`. |
| `git pull` не тянет новый код | Сравни `main` и `origin/master`: возможно нужен **`git merge origin/master`**. |
| Контейнер падает после деплоя | `docker compose logs api`; проверь **`server/.env`**, доступность БД, миграции. |
| 401 / OAuth | Redirect URI в Loginus = строки из **`server/.env`** на VPS. |

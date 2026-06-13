# Деплой на прод VPS (messenger.startapus.com)

Краткая шпаргалка для агента и разработчика. **Приватный SSH-ключ в репозиторий не кладём** — только алиас и команды.

## SSH

| Параметр | Значение |
|----------|----------|
| Алиас в `~/.ssh/config` | **`chatus-prod`** |
| Хост | `45.11.93.210` |
| Пользователь | `root` |
| Ключ (локально, не в git) | `~/.ssh/id_ed25519_startupus_chatus` |
| Каталог репозитория на VPS | `/root/chatus` |
| Docker Compose | `/root/chatus/server` |

Проверка:

```bash
ssh chatus-prod "hostname"
```

**Важно:** использовать алиас `chatus-prod`, а не `root@45.11.93.210` — иначе ключ из `config` не подставится.

## Обновить API (код + манифест OTA)

```bash
ssh chatus-prod "cd /root/chatus && git pull origin main && cd server && docker compose build api && docker compose up -d api"
```

Remote на VPS: `github.com:Startupus-Team/chatus` (corporate).

## Выложить APK на сайт (самоздат)

1. Собрать: `cd mobile && npm run android:assembleRelease:prod`
2. Поднять версию в `app.json`, `android/app/build.gradle`, `config/client-update-manifest.json`, закоммитить и `git push`
3. Залить APK:

```bash
# из корня репозитория
node scripts/deploy-apk-prod.mjs
scp server/public/downloads/chatus-release.apk chatus-prod:/root/chatus/server/public/downloads/chatus-release.apk
```

Папка `server/public/downloads` смонтирована в контейнер — **пересборка Docker для APK не нужна**.  
Манифест `client-update-manifest.json` — в образе API; после смены версии нужен `git pull` + `docker compose build api`.

## Проверка

| URL | Ожидание |
|-----|----------|
| https://messenger.startapus.com/api/health | 200 |
| https://messenger.startapus.com/client-update-manifest.json | актуальный `releaseTag` / `latestVersionCode` |
| https://messenger.startapus.com/downloads/chatus-release.apk | скачивается APK (~325 MB) |

Подробнее: [mobile/RELEASE-APK.md](../mobile/RELEASE-APK.md)

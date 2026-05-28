# Traefik для Chatus (без отдельного админа)

Прокси для `messenger.startapus.com` — совпадает с лейблами в `../docker-compose.yml`.

## Требования

- DNS: `messenger.startapus.com` → IP VPS
- Порты **80**, **443**, **4001**, **4002** свободны на хосте (80 — проверка Let's Encrypt)
- Контейнер **api** уже в сети `traefik-public` (`docker compose up` из `server/`)

## Установка на сервере

```bash
cd ~/chatus
git pull origin main

cd server/traefik
cp .env.example .env
# отредактируй ACME_EMAIL

docker network create traefik-public 2>/dev/null || true

# Перезапуск api (порты только localhost — см. ../docker-compose.yml)
cd ..
docker compose up -d api

cd traefik
docker compose up -d
docker compose logs -f --tail 50
```

## Проверка

```bash
curl -sI https://messenger.startapus.com/api/health
```

Снаружи больше не работает `http://IP:4000` — только **https://messenger.startapus.com**.

## Если порт занят

```bash
ss -tlnp | grep -E ':80|:443|:4001|:4002'
docker ps --format '{{.Names}}\t{{.Ports}}'
```

Останови процесс, который держит порт, или сначала `docker compose stop api`, подними Traefik, затем снова `api`.

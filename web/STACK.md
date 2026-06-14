# ChatUs Web — выбранный стек

**Версия:** 1.0  
**Дата:** 2026-06-12  
**Статус:** согласовано для MVP веб-версии (embed в Loginus)

---

## Назначение

Веб-клиент ChatUs для встраивания в Loginus (`/ru/support`) как **embedded app** в iframe.

- URL: `https://messenger.startapus.com/embed`
- Авторизация: Loginus `initData` → `POST /api/auth/loginus/exchange`
- Backend: существующий NestJS (`server/`), без отдельного API

Подробнее:
- **Архитектура embed:** `web/EMBED.md`
- **План фазы 1 + UI скрины:** `web/PHASE1_PLAN.md`, `web/docs/screenshots/phase1/`
- **Контракт с Loginus:** `docs/CHATUS_LOGINUS_INTEGRATION.md` (локально, может быть вне git)

---

## Стек (итог)

| Слой | Технология | Зачем |
|------|------------|-------|
| UI | **React 18** | Стандарт для SPA, отдельно от React Native |
| Язык | **TypeScript** | Как в mobile и server |
| Сборка | **Vite** | Быстрый dev/build, статика для `/embed` |
| Роутинг | **TanStack Router** | Типизированные маршруты, loaders, search params |
| Серверные данные | **TanStack Query** | Кэш чатов/сообщений, refetch, optimistic updates |
| Клиентский state | **Zustand** | UI-состояние; тот же подход, что в `mobile/` |
| HTTP | `fetch` | REST к `messenger.startapus.com/api` |
| Realtime | **WebSocket** | Существующий WS сервера; push → инвалидация Query |
| Стили | TBD (CSS Modules или Tailwind) | Решить на этапе UI-kit |

---

## Что сознательно не берём

| Технология | Причина |
|------------|---------|
| React Native Web / Expo Web | Отдельное SPA, не порт мобилки |
| React Router | TanStack Router лучше для нового проекта (типы, loaders) |
| Jotai | Zustand уже в mobile; один паттерн на всю экосистему |
| Redux / MobX | Избыточно для MVP |
| Отдельный backend | Переиспользуем NestJS |
| Telegram / TDLib в web MVP | Вне scope первой версии |
| WebRTC-звонки в web MVP | Вне scope первой версии |

---

## Разделение ответственности

```
TanStack Router   → URL, навигация, deep links
TanStack Query    → чаты, сообщения, профиль, медиа-метаданные (с сервера)
Zustand           → UI: activeChatId, draft, панели, статус WS, embed-auth phase
WebSocket         → message:new, typing, read receipts → update/invalidate Query
```

### TanStack Query — примеры

- `useChatsQuery()` — список диалогов
- `useMessagesQuery(chatId)` — история с пагинацией
- `useMeQuery()` — текущий пользователь после exchange
- После WS-события: `queryClient.invalidateQueries` или `setQueryData`

### Zustand — примеры

- текст в composer (черновик до отправки)
- открытые модалки / reply-to
- `embedStatus`: `waiting_init` | `exchanging` | `ready` | `error`
- локальный `accessToken` (если не cookie-only)

### TanStack Router — маршруты (черновик)

```
/embed/                    → список чатов
/embed/chat/$chatId        → экран переписки
```

Search params: `?q=` для поиска по чатам (опционально).

---

## Авторизация (embed)

1. Loginus шлёт `postMessage({ type: 'loginus:init', initData })`
2. Web client → `POST /api/auth/loginus/exchange { initData }`
3. Backend verify JWT (`LOGINUS_EMBEDDED_SECRET`), upsert user по `loginusId = sub`
4. Клиент получает access token ChatUs → Query + WS
5. `postMessage({ type: 'loginus:ready' })` родителю

Маппинг пользователя: тот же `loginusId`, что в мобильном приложении.

---

## Деплой и инфраструктура

| Параметр | Значение |
|----------|----------|
| Хостинг статики | `messenger.startapus.com` (рядом с API) |
| Base path Vite | `/embed/` |
| CSP | `frame-ancestors https://id.startapus.com https://*.startapus.com` |
| iframe | Прямой URL, **без** proxy Loginus (нужен WebSocket) |
| Env | `VITE_API_BASE_URL`, `VITE_WS_URL` |

---

## Структура папок (план)

```
web/
├── STACK.md                 ← этот файл
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── routes/              # TanStack Router route tree
│   ├── queries/             # TanStack Query hooks + api functions
│   ├── stores/              # Zustand stores
│   ├── embed/               # Loginus bridge (postMessage, exchange)
│   ├── ws/                  # WebSocket client
│   ├── components/
│   └── pages/
└── README.md
```

---

## MVP scope

**Включаем:**

- текстовые чаты
- медиа через HTTP
- WebSocket realtime
- auto-provision пользователя по Loginus UUID

**Не включаем (фаза 2+):**

- Telegram/TDLib
- звонки WebRTC
- unread badge в sidebar Loginus
- sidebar Loginus со списком чатов (весь UI в iframe ChatUs)

---

## Зависимости (npm, черновик)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "@tanstack/react-router": "^1",
    "@tanstack/react-query": "^5",
    "zustand": "^5"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "@tanstack/router-plugin": "^1"
  }
}
```

Точные версии зафиксировать при `npm init` в `web/`.

---

## Согласование с mobile

| Аспект | Mobile | Web |
|--------|--------|-----|
| State (UI) | Zustand | Zustand |
| API | REST + WS | REST + WS (те же endpoints) |
| Auth | OAuth code → `/auth/loginus` | initData → `/auth/loginus/exchange` |
| Offline | SQLite + sync queue | Online-first (MVP) |

Общую бизнес-логику (форматы сообщений, типы чатов) по возможности выносить в shared-пакет позже; на MVP допустимо дублирование типов.

---

## Следующие шаги

1. `npm create vite@latest web` + установка TanStack Router/Query, Zustand
2. Скелет `embed/` + `POST /auth/loginus/exchange` на server
3. POC: список чатов + один диалог + WS
4. CSP и деплой статики на prod
5. Регистрация embedded app в Loginus + тест на `/ru/support`

---

**Контакт / вопросы по стеку:** команда ChatUs

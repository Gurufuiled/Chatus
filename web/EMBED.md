# ChatUs Web — как строим embed-версию для Loginus

**Версия:** 1.0  
**Дата:** 2026-06-12  
**Аудитория:** разработчики ChatUs  
**Связанные документы:** `web/STACK.md`, `docs/CHATUS_LOGINUS_INTEGRATION.md`

---

## Содержание

1. [Зачем это нужно](#1-зачем-это-нужно)
2. [Что видит пользователь](#2-что-видит-пользователь)
3. [Модель интеграции](#3-модель-интеграции)
4. [Архитектура целиком](#4-архитектура-целиком)
5. [Кто за что отвечает](#5-кто-за-что-отвечает)
6. [Поток авторизации](#6-поток-авторизации)
7. [Пользователи и чаты](#7-пользователи-и-чаты)
8. [Что мы строим в репозитории](#8-что-мы-строим-в-репозитории)
9. [Жизненный цикл сессии](#9-жизненный-цикл-сессии)
10. [Безопасность и ограничения iframe](#10-безопасность-и-ограничения-iframe)
11. [Деплой](#11-деплой)
12. [MVP и фазы](#12-mvp-и-фазы)
13. [Порядок внедрения](#13-порядок-внедрения)
14. [Открытые продуктовые вопросы](#14-открытые-продуктовые-вопросы)

---

## 1. Зачем это нужно

**Цель:** пользователь, который вошёл в Loginus на сайте, открывает раздел **«Чаты»** и сразу попадает в ChatUs — **без установки мобильного приложения** и **без отдельного логина в ChatUs**.

Loginus — точка входа (identity). ChatUs — мессенджер (чаты, сообщения, медиа). Веб-версия — не отдельный продукт, а **клиент того же backend**, что и mobile, встроенный в экосистему Loginus.

```
Loginus (id.startapus.com)          ChatUs (messenger.startapus.com)
┌─────────────────────────┐         ┌──────────────────────────────┐
│ Вход, профиль, меню     │         │ API + WebSocket (уже есть)   │
│ Раздел «Чаты» /support  │ ──────► │ SPA /embed в iframe          │
│ Передаёт identity       │         │ Список чатов + переписка     │
└─────────────────────────┘         └──────────────────────────────┘
```

---

## 2. Что видит пользователь

### Сценарий

1. Пользователь логинится на `https://id.startapus.com`.
2. В меню Loginus нажимает **«Чаты»** (`/ru/support`, алиас `/chats`).
3. Справа от sidebar Loginus загружается **ChatUs** (на весь рабочий блок).
4. Через 1–2 секунды видит интерфейс мессенджера — **без экрана «Войти в ChatUs»**.

### Desktop / mobile web

| Платформа | Layout |
|-----------|--------|
| Desktop | Sidebar Loginus (~300px) + ChatUs на всю оставшуюся область |
| Mobile web | ChatUs на всю ширину, с учётом нижней навигации Loginus |

### Новый vs существующий пользователь ChatUs

| Ситуация | Результат |
|----------|-----------|
| Никогда не пользовался ChatUs | Аккаунт создаётся автоматически (auto-provision), список чатов пуст |
| Уже пользовался **мобильным приложением** с тем же Loginus | Тот же `loginusId` → **те же чаты** |
| Только web | Чаты из web; в приложении появятся при входе с тем же Loginus |

Установка APK/IPA **не требуется** для доступа к ChatUs через Loginus.

---

## 3. Модель интеграции

Loginus рекомендует для MVP: **Embedded App + iframe + initData**.

Это **не** простой iframe-plugin (страница без SSO) и **не** порт React Native в браузер.

| Модель | Описание | Для ChatUs |
|--------|----------|------------|
| iframe-plugin | Внешняя страница без контракта SSO | ❌ не подходит |
| web_app plugin | Плагин через plugin launch API | ❌ не основной путь |
| **embedded app** | Внешнее SPA + `initData` JWT + `postMessage` | ✅ **выбрано** |

Аналогия: как Telegram Mini App / VK Mini App — хост передаёт подписанный контекст пользователя во фрейм.

**Важно:** proxy Loginus (`/embedded-apps/proxy`) **не используем** — WebSocket через него не работает. iframe грузит ChatUs **напрямую** с `messenger.startapus.com`.

---

## 4. Архитектура целиком

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Браузер пользователя                                                     │
│                                                                           │
│  ┌──────────────────── Loginus (id.startapus.com) ────────────────────┐  │
│  │  Cookie: сессия Loginus                                              │  │
│  │  POST /api/v2/embedded-apps/launch  →  initData JWT                  │  │
│  │                                                                       │  │
│  │  ┌─ iframe: messenger.startapus.com/embed ─────────────────────┐   │  │
│  │  │  ChatUs Web (Vite + React)                                    │   │  │
│  │  │  • слушает postMessage loginus:init                           │   │  │
│  │  │  • POST /api/auth/loginus/exchange                            │   │  │
│  │  │  • TanStack Query + WS                                        │   │  │
│  │  │  • шлёт postMessage loginus:ready                             │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS + WSS
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  messenger.startapus.com (существующий NestJS)                            │
│  • POST /auth/loginus/exchange  ← NEW (verify initData, выдать сессию)   │
│  • POST /auth/loginus           ← уже есть (mobile OAuth code)          │
│  • REST: чаты, сообщения, медиа                                           │
│  • WebSocket :4001                                                        │
│  • users.loginusId = initData.sub                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Sequence (авторизация)

```
User     Loginus UI    Loginus API    ChatUs /embed    ChatUs API
  |           |              |              |               |
  |-- login ->|              |              |               |
  |-- Chats ->|              |              |               |
  |           |-- launch --->|              |               |
  |           |<- initData --|              |               |
  |           |-- load iframe ------------>|               |
  |           |-- postMessage initData --->|               |
  |           |              |              |-- exchange -->|
  |           |              |              |               | verify JWT
  |           |              |              |               | upsert user
  |           |              |              |<- token ------|
  |           |<- loginus:ready -----------|               |
  |           |              |              |-- WS connect ->|
  |<- chats --|              |              |               |
```

---

## 5. Кто за что отвечает

### Loginus (их команда)

| Задача | Статус |
|--------|--------|
| Регистрация ChatUs в `embedded_apps` (`slug: chatus`, `launchUrl`) | После нашего embed URL |
| Выдача `secretKey` для verify initData | Безопасный канал |
| Встраивание iframe в `/ru/support` | После POC |
| `POST /embedded-apps/launch` + `postMessage` | Уже реализовано |
| Право доступа к разделу: `support.read` | Уже есть |

Запись в их БД (пример):

```json
{
  "name": "ChatUs",
  "slug": "chatus",
  "launchUrl": "https://messenger.startapus.com/embed",
  "secretKey": "<выдают нам>",
  "enabled": true
}
```

### ChatUs (наша команда)

| Задача | Где |
|--------|-----|
| SPA `/embed` | `web/` |
| Bridge Loginus (`postMessage`, exchange) | `web/src/embed/` |
| `POST /auth/loginus/exchange` | `server/src/auth/` |
| CSP `frame-ancestors` для embed | nginx / server static |
| Деплой статики рядом с API | `messenger.startapus.com` |

Loginus **не переписывает** чаты у себя — только хостит наш iframe и передаёт identity.

---

## 6. Поток авторизации

### 6.1. initData

Loginus генерирует short-lived JWT (~5 мин) через launch API и передаёт во фрейм:

```js
iframe.contentWindow.postMessage(
  { type: 'loginus:init', initData: '<JWT>' },
  targetOrigin  // часто '*' при proxy; мы грузим напрямую
);
```

Ключевые поля payload:

| Поле | Назначение |
|------|------------|
| `sub` / `userId` | Стабильный UUID Loginus → **primary key** в ChatUs |
| `email`, `firstName`, `lastName`, `avatarUrl`, `locale` | Профиль (обновляем при каждом exchange) |
| `accessToken` | Опциональная двойная проверка через `/oauth/userinfo` |
| `aud` | Всегда `"embedded_app"` |
| `time` | Freshness (replay protection, TTL ~5 мин) |

### 6.2. Exchange на backend ChatUs

```http
POST /api/auth/loginus/exchange
Content-Type: application/json

{ "initData": "<JWT>" }
```

Алгоритм:

1. Verify JWT: `HS256`, секрет `LOGINUS_EMBEDDED_SECRET`, `aud`, `exp`, `time`.
2. Извлечь `sub`.
3. `findOrCreateUser` по `loginusId = sub` (как в mobile OAuth).
4. Обновить displayName, email, avatar, locale.
5. Выдать access token / сессию ChatUs (как `loginWithCode`).
6. Вернуть `{ access_token, user, ... }`.

### 6.3. Сессия после exchange

`initData` — только для **первого входа** в сессию iframe. Дальше:

- access token ChatUs в memory (Zustand) и/или httpOnly cookie (`SameSite=None; Secure`);
- WebSocket авторизуется токеном ChatUs;
- при повторном открытии «Чатов» Loginus шлёт новый initData, но если iframe жил и сессия валидна — можно не exchange повторно.

### 6.4. Протокол postMessage с хостом

| От ChatUs → Loginus | Когда |
|---------------------|-------|
| `loginus:ready` | UI загружен, exchange успешен |
| `loginus:requestInit` | Embed загрузился, но нет валидной сессии — просим Loginus прислать `loginus:init` (boot, восстановление после 401) |
| `loginus:featureRequired` | `{ feature: 'microphone' }` — родитель должен добавить `microphone` в `allow` iframe |
| `loginus:openLink` | Открыть внешнюю ссылку вне iframe |
| `loginus:data` | В будущем: unread count и т.п. |
| `loginus:close` / `loginus:expand` | По необходимости (UX Loginus дорабатывается отдельно) |

Frontend проверяет входящие сообщения:

- `event.source === window.parent`
- `event.data.type === 'loginus:init'`
- `event.origin` из whitelist (`https://id.startapus.com`, `*.startapus.com`)

Главная проверка безопасности — **на backend** (verify JWT).

---

## 7. Пользователи и чаты

### Маппинг (критично)

```
ChatUs user.loginusId  ===  initData.sub  ===  userinfo.id
```

- **Не** использовать email как primary key.
- Первый вход → auto-provision.
- Повторный → find by `loginusId`, update profile.

Mobile и web — **один аккаунт**, если один Loginus.

### MVP функциональность в iframe

| Есть | Нет (фаза 2+) |
|------|----------------|
| Текстовые чаты | Telegram / TDLib |
| Медиа через HTTP | WebRTC-звонки |
| WebSocket realtime | Unread badge в меню Loginus |
| Список + переписка внутри iframe | Sidebar Loginus со списком чатов |

---

## 8. Что мы строим в репозитории

```
testik/
├── web/                          # NEW — веб-клиент
│   ├── STACK.md                  # стек (TanStack Router/Query, Zustand)
│   ├── EMBED.md                  # этот документ
│   ├── src/
│   │   ├── embed/                # Loginus bridge, boot flow
│   │   ├── routes/               # /embed, /embed/chat/:id
│   │   ├── queries/              # чаты, сообщения (TanStack Query)
│   │   ├── stores/               # UI state (Zustand)
│   │   ├── ws/                   # WebSocket client
│   │   └── components/           # ChatList, MessageList, Composer...
│   └── vite.config.ts            # base: '/embed/'
│
├── server/                       # существующий backend
│   └── src/auth/
│       ├── auth.service.ts       # + loginWithInitData()
│       └── auth.controller.ts    # + POST loginus/exchange
│
└── mobile/                       # без изменений для embed; тот же API
```

### Boot flow веб-приложения

```
1. Загрузка /embed
2. Попытка восстановить сессию из sessionStorage; если не удалось — embedStatus = 'waiting_init' и `postMessage` `loginus:requestInit`
3. Loginus отвечает `loginus:init` → embedStatus = 'exchanging'
4. POST /auth/loginus/exchange
5. Сохранили token → embedStatus = 'ready'
6. postMessage loginus:ready
7. TanStack Router → список чатов
8. WebSocket connect
```

### Отличие от mobile

| | Mobile | Web embed |
|---|--------|-----------|
| Вход | OAuth code в WebView → `POST /auth/loginus` | initData → `POST /auth/loginus/exchange` |
| Offline | SQLite + sync queue | Online-first |
| UI | React Native | React SPA |
| Хост | Standalone app | iframe в Loginus |

---

## 9. Жизненный цикл сессии

| Событие | Поведение |
|---------|-----------|
| Первый вход в «Чаты» | launch → initData → exchange → сессия |
| Повторное открытие раздела | Новый initData; сессия ChatUs может жить, если iframe не убивали |
| Выход из Loginus | Отдельного logout postMessage **нет**; ChatUs узнает при следующем API/WS/re-launch |
| Выход только из ChatUs | Loginus **не** разлогинивается |
| Истёк initData (5 мин) | Не страшно после exchange; для re-auth — re-launch от Loginus |
| Single Logout OIDC | Не обязателен в MVP |

---

## 10. Безопасность и ограничения iframe

| Требование | Реализация |
|------------|------------|
| Токены не в URL | Только postMessage + server exchange |
| Verify initData | Backend, `LOGINUS_EMBEDDED_SECRET` |
| `secretKey` только на server | Никогда во frontend |
| CSP | `frame-ancestors https://id.startapus.com https://*.startapus.com` |
| iframe `allow` | `clipboard-read; clipboard-write; microphone` (микрофон обязателен для голосовых) |
| Не ставить | `X-Frame-Options: DENY` / `SAMEORIGIN` |
| Rate limit | На `/auth/loginus/exchange` (рекомендуется) |

Third-party cookies в iframe могут блокироваться — поэтому надёжнее держать **access token в memory** после exchange и авторизовать WS им же.

---

## 11. Деплой

| Компонент | URL |
|-----------|-----|
| Loginus | `https://id.startapus.com` |
| ChatUs API | `https://messenger.startapus.com/api` |
| ChatUs WebSocket | `wss://messenger.startapus.com` (порт как в prod) |
| ChatUs embed | `https://messenger.startapus.com/embed` |

Vite `base: '/embed/'`. Статика отдаётся с того же домена, что API (проще cookies и CORS).

Env (web):

```
VITE_API_BASE_URL=https://messenger.startapus.com/api
VITE_WS_URL=wss://...
```

Env (server):

```
LOGINUS_EMBEDDED_SECRET=<от Loginus>
```

---

## 12. MVP и фазы

### Фаза 0 — согласование ✅

- Модель: embedded app + initData
- Ответы Loginus: `CHATUS_LOGINUS_QA_RESPONSE.md`
- Стек: `web/STACK.md`

### Фаза 1 — POC

- `web/` scaffold + embed boot
- `POST /auth/loginus/exchange`
- Список чатов + один диалог + WS
- Loginus регистрирует embedded app, тест на `/support`

**Оценка:** 3–7 рабочих дней после embed URL и secretKey.

### Фаза 2 — prod

- CSP, мониторинг, rate limits
- Prod registration в Loginus
- Полная замена текущего UI «Чаты» на ChatUs

### Фаза 3 — UX расширения

- Unread badge в sidebar Loginus (`loginus:data` или server-to-server API)
- Sidebar Loginus со списком диалогов (отдельный API-контракт)
- Single Logout

---

## 13. Порядок внедрения

```
ChatUs                              Loginus
──────                              ───────
1. Реализовать web/embed + exchange
2. Настроить CSP, задеплоить статику
3. Отдать embed URL + подтверждение CSP  →  4. Зарегистрировать embedded_app
                                            5. Передать secretKey
6. Интеграционный тест на /support     ←  5. Включить iframe в «Чаты»
7. Prod
```

**От ChatUs для старта Loginus ждёт:**

1. Production embed URL
2. Staging embed URL (если есть)
3. Подтверждение CSP / отсутствие X-Frame-Options
4. Endpoint `POST /auth/loginus/exchange`
5. Подтверждение маппинга по `sub`
6. Подтверждение: прямой iframe без proxy (WebSocket)
7. Контакт разработчика и сроки POC

---

## 14. Открытые продуктовые вопросы

| Вопрос | Статус |
|--------|--------|
| ChatUs полностью заменяет текущий UI «Чаты» в Loginus? | Рекомендация Loginus: да для MVP |
| Staging Loginus для тестов? | Уточнить (`vsem-id` vs отдельный стенд) |
| Отдельное permission `chatus.read`? | Не нужно для MVP (`support.read` достаточно) |
| Shared-пакет типов mobile ↔ web? | После POC |

---

## Ссылки

- **Стек:** `web/STACK.md`
- **Интеграция (полный контракт):** `docs/CHATUS_LOGINUS_INTEGRATION.md`
- **Ответы Loginus:** `CHATUS_LOGINUS_QA_RESPONSE.md` (Downloads / передать в docs при необходимости)
- **Loginus API:** `https://id.startapus.com/api/v2/docs`
- **Mobile auth (reference):** `server/src/auth/auth.service.ts` → `loginWithCode`, `findOrCreateUser`

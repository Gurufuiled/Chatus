# Backend Implementation Plan

## Стек

План строится под текущий backend:

- `NestJS 11`
- `Prisma 6`
- `PostgreSQL`

## Новые backend-модули

В `server/src` стоит добавить:

- `account-plans/`
- `channels/`
- `channel-access/`
- `external-payments/`
- `yookassa/`
- `admin-channels/`

## Что делает каждый модуль

### `account-plans`

Отвечает за:

- права пользователя;
- тариф аккаунта;
- проверку, может ли он создать канал.

### `channels`

Отвечает за:

- создание канала;
- обновление канала;
- канальных участников;
- инвайты;
- базовую модерацию.

### `channel-access`

Отвечает за:

- allowlist;
- выдачу доступа;
- отзыв доступа;
- проверку доступа к каналу.

### `external-payments`

Отвечает за:

- внешний payment state;
- связь платежа с пользователем и каналом;
- ручную или автоматическую активацию доступа.

### `yookassa`

Отвечает только за интеграцию с `ЮKassa`:

- создание checkout session или payment intent;
- webhook/callback;
- status sync.

### `admin-channels`

Отвечает за:

- ручное подтверждение доступа;
- исключение участника;
- просмотр access state.

## Какие API нужны

### Account plan

- `GET /me/account-plan`
- `GET /me/channel-creation-rights`

### Channels

- `POST /channels`
- `PATCH /channels/:id`
- `GET /channels`
- `GET /channels/:id`
- `POST /channels/:id/invites`

### Access

- `GET /channels/:id/access-state`
- `GET /channels/:id/allowed-members`
- `POST /channels/:id/access-grants`
- `PATCH /channels/:id/access-grants/:grantId`
- `DELETE /channels/:id/access-grants/:grantId`
- `POST /channels/:id/remove-member`

### YooKassa / external payments

- `POST /external-payments/yookassa/session`
- `POST /external-payments/yookassa/webhook`
- `POST /channels/:id/access-grants/sync`

### Admin

- `GET /admin/channels/access-grants`
- `POST /admin/channels/access-grants/:id/approve`
- `POST /admin/channels/access-grants/:id/revoke`

## Порядок разработки

### Этап 1

- account plans;
- базовые права на создание канала;
- `channels` module.

### Этап 2

- allowlist;
- access state;
- выдача и отзыв доступа;
- исключение участника.

### Этап 3

- `ЮKassa` integration layer;
- ручное или webhook-подтверждение доступа.

### Этап 4

- admin tooling;
- audit;
- sync and hardening.

## Что не делать в первой backend-итерации

- не строить billing ledger;
- не строить creator payouts;
- не строить subscriptions как сложный internal lifecycle;
- не строить отдельный marketplace finance domain.

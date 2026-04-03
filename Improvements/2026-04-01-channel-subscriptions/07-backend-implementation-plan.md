# Backend Implementation Plan

## Контекст

Этот файл переводит выбранную архитектуру в конкретный backend-план под текущий стек проекта:

- `NestJS 11`
- `Prisma 6`
- `PostgreSQL`

План основан на текущей структуре сервера:

- общий root-модуль в `src/app.module.ts`
- существующие домены: `auth`, `users`, `chats`, `messages`, `upload`, `websocket`, `signaling`
- доступ к базе через `PrismaModule` и `PrismaService`

Важно:

- каналы не нужно запихивать в текущий `chats` домен;
- подписки не нужно запихивать в `users` или `messages`;
- биллинг не нужно смешивать с контентом.

Новый функционал должен зайти как отдельный набор модулей рядом с существующими.

## Что уже есть в backend

Сейчас сервер уже умеет:

- пользователей;
- чаты;
- сообщения;
- upload;
- websocket realtime;
- signaling.

В `prisma/schema.prisma` уже есть основные модели:

- `User`
- `Chat`
- `ChatMember`
- `Message`
- `Media`

Это значит:

- приватные и групповые чаты уже живут в отдельном домене;
- каналы лучше делать как новый параллельный домен, а не как новый `ChatType`.

## Главный backend-принцип

Делим реализацию на 4 backend-домена:

1. `channels`
2. `subscriptions`
3. `billing`
4. `creator-payouts`

Плюс отдельная интеграция:

5. `schetus`

## Предлагаемая структура модулей NestJS

Новые директории в `server/src`:

- `channels/`
- `subscriptions/`
- `billing/`
- `creator-payouts/`
- `schetus/`
- `admin-billing/`

### 1. `channels`

Отвечает за:

- создание канала;
- обновление канала;
- публичность/приватность;
- бесплатный/платный режим;
- инвайты;
- channel access state;
- публикацию постов канала.

Внутри:

- `channels.module.ts`
- `channels.controller.ts`
- `channels.service.ts`
- `channels-access.service.ts`
- `channels-posts.service.ts`
- `dto/`

### 2. `subscriptions`

Отвечает за:

- тарифы канала;
- подписки пользователя;
- lifecycle подписки;
- entitlement;
- access policy для платного канала.

Внутри:

- `subscriptions.module.ts`
- `subscriptions.controller.ts`
- `subscriptions.service.ts`
- `entitlements.service.ts`
- `subscription-events.service.ts`
- `dto/`

### 3. `billing`

Отвечает за:

- внутренние billing transactions;
- ledger;
- комиссии;
- refund / reversal accounting;
- reconciliation.

Внутри:

- `billing.module.ts`
- `billing.controller.ts`
- `billing.service.ts`
- `billing-ledger.service.ts`
- `billing-refunds.service.ts`
- `billing-reconciliation.service.ts`
- `dto/`

### 4. `creator-payouts`

Отвечает за:

- баланс автора;
- payout requests;
- payout history.

Внутри:

- `creator-payouts.module.ts`
- `creator-payouts.controller.ts`
- `creator-payouts.service.ts`
- `creator-balances.service.ts`
- `dto/`

### 5. `schetus`

Отвечает только за интеграцию с внешним payment rail.

Внутри:

- `schetus.module.ts`
- `schetus.service.ts`
- `schetus.controller.ts`
- `schetus-signature.service.ts`
- `schetus-mapper.service.ts`
- `interfaces/`
- `dto/`

### 6. `admin-billing`

Отвечает за админские сценарии:

- список payout requests;
- approve / reject;
- mark as paid;
- просмотр ledger и transactions.

Внутри:

- `admin-billing.module.ts`
- `admin-billing.controller.ts`
- `admin-billing.service.ts`

## Что нужно добавить в `AppModule`

После появления модулей `src/app.module.ts` должен импортировать:

- `ChannelsModule`
- `SubscriptionsModule`
- `BillingModule`
- `CreatorPayoutsModule`
- `SchetusModule`
- `AdminBillingModule`

Это нужно делать по мере готовности модулей, не все сразу в один коммит.

## План по Prisma / PostgreSQL

Ниже перечислены конкретные таблицы, которые лучше добавить в `schema.prisma`.

Названия даю в Prisma-стиле и сразу с ожидаемым SQL table name через `@@map(...)`.

## Новые enum'ы

### Для channels

- `ChannelVisibility`
  - `public`
  - `private`

- `ChannelAccessKind`
  - `free`
  - `paid`

- `ChannelMemberRole`
  - `owner`
  - `admin`
  - `subscriber`

### Для subscriptions

- `SubscriptionStatus`
  - `pending_activation`
  - `active`
  - `grace_period`
  - `expired`
  - `canceled`
  - `refunded`

- `EntitlementStatus`
  - `active`
  - `inactive`
  - `expired`
  - `revoked`

### Для billing

- `PaymentProvider`
  - `schetus`

- `BillingTransactionStatus`
  - `created`
  - `pending`
  - `paid`
  - `failed`
  - `canceled`
  - `expired`
  - `refunded`
  - `reversed`

- `BillingLedgerEntryType`
  - `payment_received`
  - `provider_fee_recorded`
  - `service_commission_recorded`
  - `creator_accrual`
  - `refund_recorded`
  - `reversal_recorded`
  - `payout_reserved`
  - `payout_completed`
  - `payout_canceled`

### Для payout

- `PayoutRequestStatus`
  - `pending`
  - `approved`
  - `rejected`
  - `canceled`
  - `paid`

## Новые таблицы Postgres / Prisma models

### 1. `Channel`

Таблица: `channels`

Нужна для:

- карточки канала;
- публичного/приватного статуса;
- бесплатного/платного статуса;
- связи с создателем.

Поля:

- `id`
- `slug`
- `title`
- `description`
- `avatarUrl`
- `visibility`
- `accessKind`
- `ownerId`
- `isPublished`
- `createdAt`
- `updatedAt`

Индексы:

- `slug unique`
- `ownerId`
- `visibility`
- `accessKind`

### 2. `ChannelMember`

Таблица: `channel_members`

Нужна для:

- владельцев;
- админов канала;
- участников канала;
- подписчиков.

Поля:

- `channelId`
- `userId`
- `role`
- `joinedAt`

Ключ:

- composite primary key: `(channelId, userId)`

### 3. `ChannelInvite`

Таблица: `channel_invites`

Нужна для приватных каналов.

Поля:

- `id`
- `channelId`
- `createdById`
- `code`
- `expiresAt`
- `maxUses`
- `usedCount`
- `isRevoked`
- `createdAt`

Индексы:

- `code unique`
- `channelId`

### 4. `ChannelPost`

Таблица: `channel_posts`

Это отдельный домен от `messages`.
Не надо использовать текущую таблицу `messages` для постов канала.

Поля:

- `id`
- `channelId`
- `authorId`
- `content`
- `mediaGroupId`
- `isDeleted`
- `createdAt`
- `updatedAt`

Индексы:

- `channelId, createdAt`
- `authorId`

### 5. `SubscriptionPlan`

Таблица: `subscription_plans`

Описывает коммерческий тариф канала.

Поля:

- `id`
- `channelId`
- `title`
- `amount`
- `currency`
- `billingPeriod`
- `isActive`
- `createdAt`
- `updatedAt`

Индексы:

- `channelId`
- `isActive`

### 6. `Subscription`

Таблица: `subscriptions`

Описывает коммерческую подписку пользователя на платный канал.

Поля:

- `id`
- `userId`
- `channelId`
- `planId`
- `status`
- `provider`
- `providerSubscriptionId`
- `currentPeriodStart`
- `currentPeriodEnd`
- `cancelAtPeriodEnd`
- `canceledAt`
- `createdAt`
- `updatedAt`

Индексы:

- `userId`
- `channelId`
- `planId`
- `providerSubscriptionId`
- `status`

### 7. `SubscriptionEntitlement`

Таблица: `subscription_entitlements`

Источник истины для доступа.

Поля:

- `id`
- `userId`
- `channelId`
- `subscriptionId`
- `status`
- `startsAt`
- `endsAt`
- `revokedAt`
- `createdAt`
- `updatedAt`

Индексы:

- `userId, channelId`
- `subscriptionId`
- `status`
- `endsAt`

### 8. `SubscriptionEvent`

Таблица: `subscription_events`

Журнал событий подписки.

Поля:

- `id`
- `subscriptionId`
- `eventType`
- `payload`
- `createdAt`

Индексы:

- `subscriptionId`
- `createdAt`

### 9. `BillingTransaction`

Таблица: `billing_transactions`

Главная таблица платежей.

Поля:

- `id`
- `userId`
- `channelId`
- `subscriptionId`
- `provider`
- `providerPaymentId`
- `providerCustomerId`
- `providerSubscriptionId`
- `checkoutSessionId`
- `status`
- `paymentMethodType`
- `currency`
- `grossAmount`
- `providerFee`
- `serviceCommission`
- `creatorNetAmount`
- `idempotencyKey`
- `rawProviderPayload`
- `paidAt`
- `createdAt`
- `updatedAt`

Индексы:

- `providerPaymentId unique`
- `checkoutSessionId`
- `subscriptionId`
- `status`
- `paidAt`

### 10. `BillingLedgerEntry`

Таблица: `billing_ledger_entries`

Append-only журнал финансовых движений.

Поля:

- `id`
- `transactionId`
- `channelId`
- `creatorId`
- `entryType`
- `currency`
- `amount`
- `meta`
- `createdAt`

Индексы:

- `transactionId`
- `creatorId`
- `entryType`
- `createdAt`

### 11. `BillingRefund`

Таблица: `billing_refunds`

Нужна для refund / reversal.

Поля:

- `id`
- `transactionId`
- `providerRefundId`
- `amount`
- `currency`
- `reason`
- `status`
- `rawProviderPayload`
- `createdAt`

Индексы:

- `transactionId`
- `providerRefundId`

### 12. `CreatorBalance`

Таблица: `creator_balances`

Нужна для агрегированного состояния баланса автора.

Поля:

- `creatorId`
- `currency`
- `pendingAccrual`
- `availableForPayout`
- `paidOutTotal`
- `updatedAt`

Ключ:

- composite unique: `(creatorId, currency)`

### 13. `CreatorPayoutRequest`

Таблица: `creator_payout_requests`

Поля:

- `id`
- `creatorId`
- `currency`
- `amount`
- `status`
- `requestedAt`
- `reviewedAt`
- `reviewedById`
- `notes`

Индексы:

- `creatorId`
- `status`
- `requestedAt`

### 14. `CreatorPayout`

Таблица: `creator_payouts`

Фиксирует уже проведенную выплату.

Поля:

- `id`
- `creatorId`
- `requestId`
- `currency`
- `amount`
- `externalReference`
- `paidByAdminId`
- `paidAt`
- `notes`
- `createdAt`

Индексы:

- `creatorId`
- `requestId`
- `paidAt`

## Что лучше не делать в схеме

- не добавлять каналы как новый `ChatType` в текущую таблицу `chats`;
- не хранить баланс автора прямо в `users`;
- не хранить только одну итоговую сумму без ledger;
- не смешивать payout records и transactions в одной таблице;
- не привязывать доступ к каналу только к факту наличия `billing_transaction.status = paid`.

## Предлагаемый порядок Prisma migration'ов

### Migration 1

- enum'ы для channels / subscriptions / billing / payouts
- `channels`
- `channel_members`
- `channel_invites`
- `channel_posts`
- `subscription_plans`

### Migration 2

- `subscriptions`
- `subscription_entitlements`
- `subscription_events`

### Migration 3

- `billing_transactions`
- `billing_ledger_entries`
- `billing_refunds`

### Migration 4

- `creator_balances`
- `creator_payout_requests`
- `creator_payouts`

Так проще:

- не раздувать одну гигантскую миграцию;
- проще откатывать и проверять;
- проще команде ревьюить схему.

## Конкретный план разработки по backend

### Этап 1. Создать каркас модулей

Создать в `src/`:

- `channels`
- `subscriptions`
- `billing`
- `creator-payouts`
- `schetus`
- `admin-billing`

На этом этапе достаточно:

- module
- controller
- service
- пустых DTO

Цель:

- сразу зафиксировать boundaries доменов.

### Этап 2. Prisma schema + первые migrations

Изменить:

- [schema.prisma](/c:/Users/artem/Desktop/works/testik/server/prisma/schema.prisma)

Сделать:

- новые enum'ы
- новые модели
- индексы
- связи с `User`

Потом:

- `npx prisma generate`
- `npx prisma migrate dev`

### Этап 3. Базовый channels API

Сначала сделать без оплаты.

Endpoints:

- `POST /channels`
- `PATCH /channels/:id`
- `GET /channels`
- `GET /channels/:id`
- `POST /channels/:id/invites`
- `GET /channels/:id/access-state`

Что должно уже работать:

- создание канала;
- публичный/приватный;
- бесплатный/платный;
- проверка доступа;
- инвайты.

### Этап 4. Базовый subscription слой

Добавить:

- создание `subscription intent`
- `subscription_plans`
- `subscriptions`
- `subscription_entitlements`

Endpoints:

- `GET /channels/:id/plans`
- `POST /channels/:id/subscribe/session`
- `GET /subscriptions/me`

### Этап 5. Интеграция со `Счетус`

На этом этапе делаем только payment session + webhook.

Нужно:

- `SchetusService.createPaymentSession()`
- `SchetusController` для webhook/callback
- валидация подписи
- idempotency
- mapping provider statuses -> internal statuses

Endpoints:

- `POST /billing/schetus/session`
- `POST /billing/schetus/webhook`

### Этап 6. Entitlement activation flow

После подтверждения оплаты:

- найти `subscription intent`
- создать или активировать `subscription`
- создать или продлить `subscription_entitlement`
- вернуть `channel access state = unlocked`

Это должен делать backend автоматически, не клиент.

### Этап 7. Ledger и creator balance

После подтвержденного платежа:

- создать `billing_transaction`
- записать `billing_ledger_entries`
- записать:
  - `payment_received`
  - `provider_fee_recorded`
  - `service_commission_recorded`
  - `creator_accrual`
- обновить `creator_balances`

### Этап 8. Refund / reversal flow

После этого можно безопасно добавлять:

- `billing_refunds`
- отрицательные ledger entries
- пересчет balance
- пересчет entitlement при необходимости

### Этап 9. Creator payout flow

Сделать:

- `GET /creators/me/balance`
- `POST /creators/me/payout-requests`
- админские payout endpoints

Сделать admin endpoints:

- `GET /admin/creator-payouts`
- `POST /admin/creator-payouts/:id/approve`
- `POST /admin/creator-payouts/:id/mark-paid`

### Этап 10. Background jobs и reconciliation

Нужны джобы:

- reconcile `pending` transactions
- expire old entitlements
- recalc creator balances if needed
- detect unmatched provider events

Если у вас пока нет очередей, первую версию можно начать с cron/interval job внутри backend, но лучше сразу закладывать выделенный job flow.

## Что трогать в текущем коде

### Уже существующие файлы

Точно понадобятся изменения в:

- [app.module.ts](/c:/Users/artem/Desktop/works/testik/server/src/app.module.ts)
- [schema.prisma](/c:/Users/artem/Desktop/works/testik/server/prisma/schema.prisma)

С высокой вероятностью понадобятся интеграции с:

- `auth` для creator/admin guards
- `users` для профиля автора
- `websocket` если захотите realtime-обновление channel access state

### Что лучше не трогать без необходимости

- текущий `messages` домен
- текущий `chats` домен
- signaling
- upload

Их лучше подключать к каналам только через явную интеграцию, а не через слияние доменов.

## Предлагаемая последовательность по PR'ам

### PR 1

- каркас новых модулей
- импорт в `app.module.ts`

### PR 2

- Prisma schema: channels + plans
- migrations

### PR 3

- channels API
- access-state API
- invites

### PR 4

- subscriptions + entitlements
- subscribe session creation

### PR 5

- `Счетус` integration
- webhook/callback
- payment verification

### PR 6

- billing transactions
- ledger
- creator balances

### PR 7

- payout requests
- admin payout actions

### PR 8

- refund handling
- reconciliation jobs
- hardening

## Что нужно проверить до старта разработки

- умеет ли `Счетус` recurring subscriptions;
- есть ли sandbox;
- есть ли webhook signature;
- есть ли provider fee в данных;
- как приходят refund/chargeback events;
- есть ли стабильный `providerPaymentId`.

## Итог

Самая правильная backend-реализация для вашего проекта выглядит так:

- каналы как новый самостоятельный домен;
- подписки как отдельный домен поверх каналов;
- `Счетус` как внешний payment rail через отдельный integration layer;
- ledger и creator balance как отдельный billing/payout слой;
- реализация через новые NestJS-модули и Prisma migrations поэтапно.

Если идти именно в таком порядке, внедрение получится управляемым, без смешивания чатов, контента, доступа и денег в одну трудно поддерживаемую систему.

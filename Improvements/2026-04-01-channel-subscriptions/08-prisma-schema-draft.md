# Prisma Schema Draft

## Контекст

Этот файл — черновик будущих изменений для [schema.prisma](/c:/Users/artem/Desktop/works/testik/server/prisma/schema.prisma).

Он нужен как переходный слой между:

- архитектурным решением;
- backend implementation plan;
- реальной Prisma migration работой.

Это не означает, что весь блок нужно бездумно вставить в продовый `schema.prisma` одним куском.
Но он специально написан максимально близко к реальному Prisma-синтаксису.

## Цель

Подготовить почти готовую модель данных для:

- каналов;
- подписок;
- entitlement;
- биллинга через `Счетус`;
- баланса автора;
- ручных выплат.

## Важная оговорка

В текущем `schema.prisma` уже есть:

- `ChatMemberRole`

Для каналов лучше не переиспользовать этот enum напрямую, потому что роли в канале и роли в обычном чате — это логически разные вещи.

Поэтому здесь используется отдельный enum:

- `ChannelRole`

Это уменьшит путаницу в Prisma-клиенте и в коде сервисов.

## Draft Enums

```prisma
enum ChannelVisibility {
  public
  private
}

enum ChannelAccessKind {
  free
  paid
}

enum ChannelRole {
  owner
  admin
  subscriber
}

enum ChannelPostStatus {
  published
  deleted
}

enum BillingPeriod {
  weekly
  monthly
  quarterly
  yearly
}

enum SubscriptionStatus {
  pending_activation
  active
  grace_period
  expired
  canceled
  refunded
}

enum EntitlementStatus {
  active
  inactive
  expired
  revoked
}

enum PaymentProvider {
  schetus
}

enum BillingTransactionStatus {
  created
  pending
  paid
  failed
  canceled
  expired
  refunded
  reversed
}

enum BillingLedgerEntryType {
  payment_received
  provider_fee_recorded
  service_commission_recorded
  creator_accrual
  refund_recorded
  reversal_recorded
  payout_reserved
  payout_completed
  payout_canceled
}

enum RefundStatus {
  pending
  completed
  failed
  canceled
}

enum PayoutRequestStatus {
  pending
  approved
  rejected
  canceled
  paid
}
```

## Draft Models

```prisma
model Channel {
  id          String            @id @default(uuid())
  slug        String            @unique
  title       String
  description String?
  avatarUrl   String?           @map("avatar_url")
  visibility  ChannelVisibility
  accessKind  ChannelAccessKind @map("access_kind")
  ownerId     String            @map("owner_id")
  isPublished Boolean           @default(false) @map("is_published")
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt @map("updated_at")

  owner         User                       @relation("ChannelOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members       ChannelMember[]
  invites       ChannelInvite[]
  posts         ChannelPost[]
  plans         SubscriptionPlan[]
  subscriptions Subscription[]
  entitlements  SubscriptionEntitlement[]
  transactions  BillingTransaction[]

  @@index([ownerId])
  @@index([visibility])
  @@index([accessKind])
  @@map("channels")
}

model ChannelMember {
  channelId String      @map("channel_id")
  userId    String      @map("user_id")
  role      ChannelRole @default(subscriber)
  joinedAt  DateTime    @default(now()) @map("joined_at")

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user    User    @relation("UserChannelMemberships", fields: [userId], references: [id], onDelete: Cascade)

  @@id([channelId, userId])
  @@index([userId])
  @@map("channel_members")
}

model ChannelInvite {
  id          String    @id @default(uuid())
  channelId   String    @map("channel_id")
  createdById String    @map("created_by_id")
  code        String    @unique
  expiresAt   DateTime? @map("expires_at")
  maxUses     Int?      @map("max_uses")
  usedCount   Int       @default(0) @map("used_count")
  isRevoked   Boolean   @default(false) @map("is_revoked")
  createdAt   DateTime  @default(now()) @map("created_at")

  channel   Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  createdBy User    @relation("ChannelInviteCreator", fields: [createdById], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@index([createdById])
  @@map("channel_invites")
}

model ChannelPost {
  id         String            @id @default(uuid())
  channelId  String            @map("channel_id")
  authorId   String            @map("author_id")
  content    String?
  status     ChannelPostStatus @default(published)
  createdAt  DateTime          @default(now()) @map("created_at")
  updatedAt  DateTime          @updatedAt @map("updated_at")

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author  User    @relation("ChannelPostAuthor", fields: [authorId], references: [id], onDelete: Cascade)

  @@index([channelId, createdAt])
  @@index([authorId])
  @@map("channel_posts")
}

model SubscriptionPlan {
  id            String        @id @default(uuid())
  channelId      String        @map("channel_id")
  title          String
  amount         Decimal       @db.Decimal(18, 2)
  currency       String        @db.VarChar(3)
  billingPeriod  BillingPeriod @map("billing_period")
  isActive       Boolean       @default(true) @map("is_active")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  channel        Channel                   @relation(fields: [channelId], references: [id], onDelete: Cascade)
  subscriptions  Subscription[]
  transactions   BillingTransaction[]

  @@index([channelId])
  @@index([isActive])
  @@map("subscription_plans")
}

model Subscription {
  id                    String             @id @default(uuid())
  userId                String             @map("user_id")
  channelId             String             @map("channel_id")
  planId                String             @map("plan_id")
  status                SubscriptionStatus
  provider              PaymentProvider
  providerSubscriptionId String?           @map("provider_subscription_id")
  currentPeriodStart    DateTime?          @map("current_period_start")
  currentPeriodEnd      DateTime?          @map("current_period_end")
  cancelAtPeriodEnd     Boolean            @default(false) @map("cancel_at_period_end")
  canceledAt            DateTime?          @map("canceled_at")
  createdAt             DateTime           @default(now()) @map("created_at")
  updatedAt             DateTime           @updatedAt @map("updated_at")

  user          User                       @relation("UserSubscriptions", fields: [userId], references: [id], onDelete: Cascade)
  channel       Channel                    @relation(fields: [channelId], references: [id], onDelete: Cascade)
  plan          SubscriptionPlan           @relation(fields: [planId], references: [id], onDelete: Restrict)
  entitlements  SubscriptionEntitlement[]
  events        SubscriptionEvent[]
  transactions  BillingTransaction[]

  @@index([userId])
  @@index([channelId])
  @@index([planId])
  @@index([providerSubscriptionId])
  @@index([status])
  @@map("subscriptions")
}

model SubscriptionEntitlement {
  id             String            @id @default(uuid())
  userId         String            @map("user_id")
  channelId      String            @map("channel_id")
  subscriptionId String            @map("subscription_id")
  status         EntitlementStatus
  startsAt       DateTime          @map("starts_at")
  endsAt         DateTime?         @map("ends_at")
  revokedAt      DateTime?         @map("revoked_at")
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")

  user         User         @relation("UserEntitlements", fields: [userId], references: [id], onDelete: Cascade)
  channel      Channel      @relation(fields: [channelId], references: [id], onDelete: Cascade)
  subscription Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([userId, channelId])
  @@index([subscriptionId])
  @@index([status])
  @@index([endsAt])
  @@map("subscription_entitlements")
}

model SubscriptionEvent {
  id             String   @id @default(uuid())
  subscriptionId String   @map("subscription_id")
  eventType      String   @map("event_type")
  payload        Json
  createdAt      DateTime @default(now()) @map("created_at")

  subscription Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId])
  @@index([createdAt])
  @@map("subscription_events")
}

model BillingTransaction {
  id                    String                   @id @default(uuid())
  userId                String                   @map("user_id")
  channelId             String                   @map("channel_id")
  planId                String?                  @map("plan_id")
  subscriptionId        String?                  @map("subscription_id")
  provider              PaymentProvider
  providerPaymentId     String                   @unique @map("provider_payment_id")
  providerCustomerId    String?                  @map("provider_customer_id")
  providerSubscriptionId String?                 @map("provider_subscription_id")
  checkoutSessionId     String?                  @map("checkout_session_id")
  status                BillingTransactionStatus
  paymentMethodType     String?                  @map("payment_method_type")
  currency              String                   @db.VarChar(3)
  grossAmount           Decimal                  @map("gross_amount") @db.Decimal(18, 2)
  providerFee           Decimal                  @map("provider_fee") @db.Decimal(18, 2)
  serviceCommission     Decimal                  @map("service_commission") @db.Decimal(18, 2)
  creatorNetAmount      Decimal                  @map("creator_net_amount") @db.Decimal(18, 2)
  idempotencyKey        String?                  @unique @map("idempotency_key")
  rawProviderPayload    Json?                    @map("raw_provider_payload")
  paidAt                DateTime?                @map("paid_at")
  createdAt             DateTime                 @default(now()) @map("created_at")
  updatedAt             DateTime                 @updatedAt @map("updated_at")

  user          User                 @relation("UserBillingTransactions", fields: [userId], references: [id], onDelete: Cascade)
  channel       Channel              @relation(fields: [channelId], references: [id], onDelete: Cascade)
  plan          SubscriptionPlan?    @relation(fields: [planId], references: [id], onDelete: SetNull)
  subscription  Subscription?        @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)
  ledgerEntries BillingLedgerEntry[]
  refunds       BillingRefund[]

  @@index([userId])
  @@index([channelId])
  @@index([planId])
  @@index([subscriptionId])
  @@index([checkoutSessionId])
  @@index([status])
  @@index([paidAt])
  @@map("billing_transactions")
}

model BillingLedgerEntry {
  id            String                @id @default(uuid())
  transactionId String                @map("transaction_id")
  creatorId     String                @map("creator_id")
  channelId     String                @map("channel_id")
  entryType     BillingLedgerEntryType @map("entry_type")
  currency      String                @db.VarChar(3)
  amount        Decimal               @db.Decimal(18, 2)
  meta          Json?
  createdAt     DateTime              @default(now()) @map("created_at")

  transaction BillingTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  creator     User               @relation("CreatorLedgerEntries", fields: [creatorId], references: [id], onDelete: Cascade)
  channel     Channel            @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([transactionId])
  @@index([creatorId])
  @@index([channelId])
  @@index([entryType])
  @@index([createdAt])
  @@map("billing_ledger_entries")
}

model BillingRefund {
  id                 String       @id @default(uuid())
  transactionId      String       @map("transaction_id")
  providerRefundId   String?      @unique @map("provider_refund_id")
  amount             Decimal      @db.Decimal(18, 2)
  currency           String       @db.VarChar(3)
  reason             String?
  status             RefundStatus
  rawProviderPayload Json?        @map("raw_provider_payload")
  createdAt          DateTime     @default(now()) @map("created_at")

  transaction BillingTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  @@index([transactionId])
  @@index([status])
  @@map("billing_refunds")
}

model CreatorBalance {
  id                 String   @id @default(uuid())
  creatorId          String   @map("creator_id")
  currency           String   @db.VarChar(3)
  pendingAccrual     Decimal  @default(0) @map("pending_accrual") @db.Decimal(18, 2)
  availableForPayout Decimal  @default(0) @map("available_for_payout") @db.Decimal(18, 2)
  paidOutTotal       Decimal  @default(0) @map("paid_out_total") @db.Decimal(18, 2)
  updatedAt          DateTime @updatedAt @map("updated_at")

  creator User                   @relation("CreatorBalances", fields: [creatorId], references: [id], onDelete: Cascade)
  payoutRequests CreatorPayoutRequest[]
  payouts        CreatorPayout[]

  @@unique([creatorId, currency])
  @@index([creatorId])
  @@map("creator_balances")
}

model CreatorPayoutRequest {
  id           String              @id @default(uuid())
  creatorId    String              @map("creator_id")
  balanceId    String              @map("balance_id")
  currency     String              @db.VarChar(3)
  amount       Decimal             @db.Decimal(18, 2)
  status       PayoutRequestStatus
  requestedAt  DateTime            @default(now()) @map("requested_at")
  reviewedAt   DateTime?           @map("reviewed_at")
  reviewedById String?             @map("reviewed_by_id")
  notes        String?

  creator    User           @relation("CreatorPayoutRequests", fields: [creatorId], references: [id], onDelete: Cascade)
  balance    CreatorBalance @relation(fields: [balanceId], references: [id], onDelete: Cascade)
  reviewedBy User?          @relation("PayoutReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  payout     CreatorPayout?

  @@index([creatorId])
  @@index([balanceId])
  @@index([status])
  @@index([requestedAt])
  @@map("creator_payout_requests")
}

model CreatorPayout {
  id                String   @id @default(uuid())
  creatorId         String   @map("creator_id")
  balanceId         String   @map("balance_id")
  requestId         String?  @unique @map("request_id")
  currency          String   @db.VarChar(3)
  amount            Decimal  @db.Decimal(18, 2)
  externalReference String?  @map("external_reference")
  paidByAdminId     String?  @map("paid_by_admin_id")
  paidAt            DateTime? @map("paid_at")
  notes             String?
  createdAt         DateTime @default(now()) @map("created_at")

  creator     User                 @relation("CreatorPayouts", fields: [creatorId], references: [id], onDelete: Cascade)
  balance     CreatorBalance       @relation(fields: [balanceId], references: [id], onDelete: Cascade)
  request     CreatorPayoutRequest? @relation(fields: [requestId], references: [id], onDelete: SetNull)
  paidByAdmin User?                @relation("PayoutPaidByAdmin", fields: [paidByAdminId], references: [id], onDelete: SetNull)

  @@index([creatorId])
  @@index([balanceId])
  @@index([paidByAdminId])
  @@index([paidAt])
  @@map("creator_payouts")
}
```

## Какие relation-поля нужно будет добавить в текущий `User`

В текущий `User` потребуется добавить relation-поля примерно такого вида:

```prisma
model User {
  // existing fields...

  ownedChannels          Channel[]                @relation("ChannelOwner")
  channelMemberships     ChannelMember[]          @relation("UserChannelMemberships")
  createdChannelInvites  ChannelInvite[]          @relation("ChannelInviteCreator")
  channelPosts           ChannelPost[]            @relation("ChannelPostAuthor")
  subscriptions          Subscription[]           @relation("UserSubscriptions")
  entitlements           SubscriptionEntitlement[] @relation("UserEntitlements")
  billingTransactions    BillingTransaction[]     @relation("UserBillingTransactions")
  creatorLedgerEntries   BillingLedgerEntry[]     @relation("CreatorLedgerEntries")
  creatorBalances        CreatorBalance[]         @relation("CreatorBalances")
  payoutRequests         CreatorPayoutRequest[]   @relation("CreatorPayoutRequests")
  creatorPayouts         CreatorPayout[]          @relation("CreatorPayouts")
  reviewedPayoutRequests CreatorPayoutRequest[]   @relation("PayoutReviewer")
  adminPaidPayouts       CreatorPayout[]          @relation("PayoutPaidByAdmin")
}
```

## Что, скорее всего, придется поправить при реальной интеграции

### 1. `Decimal`

Если в вашем Prisma-клиенте финансовые поля неудобно использовать на первом этапе, можно временно хранить minor units как `BigInt`/`Int`, но для billing-домена `Decimal(18,2)` обычно чище.

### 2. `ChannelPost`

Если потом решите, что посты канала должны поддерживать сложные media-группы или реплаи, модель нужно будет расширить.

### 3. `RefundStatus`

Если `Счетус` дает более детальную refund lifecycle модель, enum можно расширить.

### 4. `BillingPeriod`

Если будут только месячные подписки, можно начать с одного значения и расширить позже.

## Рекомендуемый порядок внедрения этого draft'а в реальный `schema.prisma`

Не вставлять все одним коммитом.

Лучше так:

1. enum'ы + `Channel`, `ChannelMember`, `ChannelInvite`, `ChannelPost`, `SubscriptionPlan`
2. `Subscription`, `SubscriptionEntitlement`, `SubscriptionEvent`
3. `BillingTransaction`, `BillingLedgerEntry`, `BillingRefund`
4. `CreatorBalance`, `CreatorPayoutRequest`, `CreatorPayout`
5. relation-поля в `User`

## Что важно проверить перед реальной миграцией

- нет ли конфликтов имен relation в `User`
- устраивают ли `Decimal(18,2)` поля под ваш billing
- нужна ли мультивалютность с первой версии
- нужен ли `providerSubscriptionId` сразу
- нужен ли `ChannelPost` как отдельная сущность уже в первой фазе, или сначала можно дать только канал + доступ + подписку

## Итог

Этот draft уже можно использовать как основу для:

- обсуждения backend-схемы;
- ревью с командой;
- поэтапного переноса в реальный `schema.prisma`;
- подготовки Prisma migrations.

Если захотите, следующим шагом можно сделать еще ближе к коду:

- `09-prisma-migration-breakdown.md`

где я распишу, какие куски этого schema draft в какие migration-файлы лучше разнести.

# Prisma Schema Draft

## Контекст

Это черновик Prisma-схемы под новую упрощенную модель:

- права аккаунта;
- каналы;
- allowlist;
- внешний доступ;
- `ЮKassa` как текущий внешний сервис.

## Draft Enums

```prisma
enum AccountPlanTier {
  chat_only
  plan_3000
  plan_9000
  plan_27000
}

enum AccountPlanStatus {
  active
  expired
  revoked
}

enum ChannelVisibility {
  public
  private
}

enum ChannelRole {
  owner
  admin
  member
}

enum AccessGrantStatus {
  active
  pending
  expired
  revoked
}

enum AccessGrantSource {
  manual
  admin
  api
  yookassa
}

enum ExternalPaymentProvider {
  yookassa
}

enum ExternalPaymentStatus {
  created
  pending
  paid
  failed
  canceled
  expired
}
```

## Draft Models

```prisma
model UserAccountPlan {
  id          String            @id @default(uuid())
  userId       String            @map("user_id")
  tier         AccountPlanTier
  status       AccountPlanStatus
  startsAt     DateTime?         @map("starts_at")
  endsAt       DateTime?         @map("ends_at")
  externalRef  String?           @map("external_ref")
  createdAt    DateTime          @default(now()) @map("created_at")
  updatedAt    DateTime          @updatedAt @map("updated_at")

  user         User              @relation("UserAccountPlans", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@map("user_account_plans")
}

model Channel {
  id           String            @id @default(uuid())
  slug         String            @unique
  title        String
  description  String?
  ownerId      String            @map("owner_id")
  visibility   ChannelVisibility
  isPublished  Boolean           @default(false) @map("is_published")
  createdAt    DateTime          @default(now()) @map("created_at")
  updatedAt    DateTime          @updatedAt @map("updated_at")

  owner        User              @relation("ChannelOwnerV2", fields: [ownerId], references: [id], onDelete: Cascade)
  members      ChannelMember[]
  invites      ChannelInvite[]
  accessGrants ChannelAccessGrant[]

  @@index([ownerId])
  @@index([visibility])
  @@map("channels_v2")
}

model ChannelMember {
  channelId    String      @map("channel_id")
  userId       String      @map("user_id")
  role         ChannelRole @default(member)
  joinedAt     DateTime    @default(now()) @map("joined_at")

  channel      Channel     @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user         User        @relation("UserChannelMembershipsV2", fields: [userId], references: [id], onDelete: Cascade)

  @@id([channelId, userId])
  @@index([userId])
  @@map("channel_members_v2")
}

model ChannelInvite {
  id           String      @id @default(uuid())
  channelId     String      @map("channel_id")
  createdById   String      @map("created_by_id")
  code         String      @unique
  expiresAt    DateTime?   @map("expires_at")
  maxUses      Int?        @map("max_uses")
  usedCount    Int         @default(0) @map("used_count")
  isRevoked    Boolean     @default(false) @map("is_revoked")
  createdAt    DateTime    @default(now()) @map("created_at")

  channel      Channel     @relation(fields: [channelId], references: [id], onDelete: Cascade)
  createdBy    User        @relation("ChannelInviteCreatorV2", fields: [createdById], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@map("channel_invites_v2")
}

model ChannelAccessGrant {
  id              String               @id @default(uuid())
  channelId        String               @map("channel_id")
  userId           String?              @map("user_id")
  externalIdentity String?              @map("external_identity")
  source           AccessGrantSource
  provider         ExternalPaymentProvider?
  providerRef      String?              @map("provider_ref")
  status           AccessGrantStatus
  validUntil       DateTime?            @map("valid_until")
  notes            String?
  createdById      String?              @map("created_by_id")
  createdAt        DateTime             @default(now()) @map("created_at")
  updatedAt        DateTime             @updatedAt @map("updated_at")

  channel          Channel              @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user             User?                @relation("UserChannelAccessGrants", fields: [userId], references: [id], onDelete: SetNull)
  createdBy        User?                @relation("ChannelAccessGrantCreator", fields: [createdById], references: [id], onDelete: SetNull)
  payments         ExternalPaymentRecord[]

  @@index([channelId])
  @@index([userId])
  @@index([status])
  @@index([providerRef])
  @@map("channel_access_grants")
}

model ExternalPaymentRecord {
  id               String                  @id @default(uuid())
  channelId         String                  @map("channel_id")
  userId            String?                 @map("user_id")
  accessGrantId     String?                 @map("access_grant_id")
  provider          ExternalPaymentProvider
  providerPaymentId String                  @unique @map("provider_payment_id")
  status            ExternalPaymentStatus
  amount            Decimal                 @db.Decimal(18, 2)
  currency          String                  @db.VarChar(3)
  paidAt            DateTime?               @map("paid_at")
  rawPayload        Json?                   @map("raw_payload")
  createdAt         DateTime                @default(now()) @map("created_at")
  updatedAt         DateTime                @updatedAt @map("updated_at")

  channel           Channel                 @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user              User?                   @relation("UserExternalPayments", fields: [userId], references: [id], onDelete: SetNull)
  accessGrant       ChannelAccessGrant?     @relation(fields: [accessGrantId], references: [id], onDelete: SetNull)

  @@index([channelId])
  @@index([userId])
  @@index([accessGrantId])
  @@index([status])
  @@map("external_payment_records")
}
```

## Что нужно добавить в `User`

```prisma
model User {
  // existing fields...

  accountPlans        UserAccountPlan[]       @relation("UserAccountPlans")
  ownedChannelsV2     Channel[]               @relation("ChannelOwnerV2")
  channelMembershipsV2 ChannelMember[]        @relation("UserChannelMembershipsV2")
  createdChannelInvitesV2 ChannelInvite[]     @relation("ChannelInviteCreatorV2")
  channelAccessGrants ChannelAccessGrant[]    @relation("UserChannelAccessGrants")
  createdAccessGrants ChannelAccessGrant[]    @relation("ChannelAccessGrantCreator")
  externalPayments    ExternalPaymentRecord[] @relation("UserExternalPayments")
}
```

## Практический смысл этой схемы

Она покрывает:

- право пользователя создавать канал;
- сам канал;
- участников;
- allowlist;
- внешний платеж через `ЮKassa`;
- связь платежа и разрешения на доступ.

И при этом не тащит за собой:

- payout domain;
- revenue sharing;
- internal finance platform.

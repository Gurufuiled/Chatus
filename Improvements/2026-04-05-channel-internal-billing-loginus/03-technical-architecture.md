# Technical Architecture

## Core Principle

Treat `Loginus account type` as the first entitlement source for the app.

That means:

- billing changes the plan/type outside the app;
- `Loginus` reflects the new type;
- backend/app consume that type;
- product capabilities are unlocked from that type.

## Suggested Domains

For the first rollout, keep the architecture lean:

1. `billing-integration`
2. `auth/loginus-sync`
3. `account-entitlements`
4. `channels`

## Responsibility Split

### Internal Billing

- accepts payment;
- processes test/real transactions;
- updates account type in `Loginus`.

### Loginus

- stores the account type visible to the product;
- becomes the practical identity/plan source.

### Backend

- reads account type from auth/profile/loginus sync;
- exposes it to the mobile app;
- enforces capability checks on protected actions;
- optionally refreshes/syncs the account type if needed.

### Mobile App

- reads account type from auth/session/profile state;
- shows locked/unlocked UI;
- hides or disables creation actions when the tier is insufficient.

## Recommended Entitlement Shape

For version one, use a capability mapping layer instead of scattering raw plan checks everywhere.

Example:

- `basic`
  - chats only
- `creator_3000`
  - can create some groups/channels
- `creator_9000`
  - broader creation rights
- `creator_27000`
  - highest creator/publisher rights

Even if the actual plan names differ, the product should map:

`account_type -> capabilities`

instead of hardcoding plan strings deep in screens.

## Data Flow

1. user logs in;
2. backend receives or resolves current `Loginus account type`;
3. backend includes account type / capabilities in auth/session payload;
4. mobile stores it in auth/user state;
5. channel/group creation UI checks capabilities;
6. protected backend endpoints also check capabilities server-side.

## Why This Is Better Than UI-Only Checks

- safer;
- easier to debug;
- consistent across devices;
- works for both frontend UX and backend enforcement.

## Important Future Extension

If later the business wants:

- channel-level paid memberships,
- creator payouts,
- or commission accounting,

those can be added as a separate monetization domain.

The current architecture should not pretend that account-type gating alone solves the entire future finance model.

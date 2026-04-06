# Final Decision

## Task Name

`Channels with internal billing and Loginus account-type access`

## Decision Date

`2026-04-05`

## Status

`approved`

## This Decision Supersedes

- `../2026-04-03-channel-access-external-payments/final-decision-current.md`
- `../2026-04-01-channel-subscriptions/final-decision-current.md`

Both older branches remain in the repo as decision history.

## Chosen Direction

`Internal Billing (Schetus/Billingus) + Loginus Account Type + Capability-Based Access`

## Why This Is Now The Current Direction

- it reflects the latest boss clarification;
- internal billing already worked in test payments;
- the missing part is production enablement, not conceptual feasibility;
- billing can already influence `Loginus account type`;
- the app can use that account type as the first entitlement/access signal;
- this is much lighter than building a full finance marketplace immediately.

## Chosen Source Of Truth

For version one, the practical access source should be:

- `Loginus account type`

The product should derive capabilities from that type.

## What Is Included In The First Delivery

- internal billing as the payment direction;
- account type changes flowing into `Loginus`;
- app/backend reading account type;
- capability-based gating for:
  - group creation
  - channel creation
  - public/private creator rights as defined by product rules
- locked/unlocked UI states in the app;
- centralized account-type-to-capability mapping.

## What Is Explicitly Not Required In This Decision

- external `YooKassa` as the primary first rail;
- creator payout engine;
- creator ledger as mandatory version-one scope;
- manual payout admin tooling as mandatory version-one scope;
- per-channel finance accounting unless separately confirmed later.

## User Flow

1. user pays through internal billing;
2. billing updates the user's account type in `Loginus`;
3. user logs in again, refreshes session, or the app/backend syncs state;
4. the app sees the new account type;
5. the correct capabilities become available.

## Technical Flow

1. backend resolves current `Loginus account type`;
2. backend maps it to internal capabilities;
3. backend returns account type/capabilities in auth or profile payloads;
4. mobile stores them in user/auth state;
5. UI and protected endpoints both enforce the same capabilities.

## Product Mapping Still To Confirm

The main remaining product task is the tier matrix:

- which exact account types exist;
- which of them correspond to levels like `3000 / 9000 / 27000`;
- what each tier unlocks in terms of channels/groups/publics;
- whether future paid channel membership needs a separate model beyond account type.

## Practical Recommendation

Build this in two steps:

1. ship account-type sync and capability gating first;
2. only then decide whether future channel monetization needs the heavier subscription/ledger/payout model.

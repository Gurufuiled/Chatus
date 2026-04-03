# Final Decision

> Superseded on `2026-04-03` by:
> `../2026-04-03-channel-access-external-payments/final-decision-current.md`
>
> This file remains as history for the earlier internal billing / Schetus / creator payout approach.

## Task Name

`Channel subscriptions`

## Decision Date

`2026-04-02`

## Status

`approved`

## Supersedes

This decision supersedes the payment rail choice from:

- `final-decision-2026-04-01-superseded.md`

The previous document remains in the folder as part of the decision history.

## Chosen Variant

`Variant 3 + Variant B`

Clarification for the first production payment rail:

- `Schetus`

## Why This Is The Chosen Direction

- it keeps the correct long-term architecture for paid channels and subscriptions;
- it keeps access control on the server through entitlements;
- it keeps billing independent from content access;
- it supports service commission from the first version;
- it supports creator earnings accounting from the first version;
- it supports manual payouts without requiring immediate payout automation;
- it removes the need to split first-release billing by platform;
- it keeps the door open for future additional payment rails if needed.

## What Changes Compared With The Previous Decision

Before:

- `iOS -> Apple App Store subscriptions`
- `Android -> Google Play subscriptions`

Now:

- `iOS -> Schetus`
- `Android -> Schetus`
- potential future web/admin payment flows can also go through `Schetus`

The architectural base does not change.
Only the selected first payment rail changes.

## What Is Included In The First Delivery

- channels as a new product entity;
- public and private channels;
- free and paid channels;
- server-side access control through entitlement;
- paid subscription flow through `Schetus`;
- paywall in the mobile application;
- locked/unlocked channel state;
- server-side subscription status tracking;
- billing ledger;
- provider fee accounting through `Schetus`;
- service commission accounting;
- creator earnings calculation;
- creator internal balance;
- manual payouts to creators by admin;
- payout history.

## What Is Explicitly Not Included In The First Delivery

- automatic payouts to creators;
- advanced creator analytics;
- multi-tier plans;
- promo codes and discount mechanics;
- external payout provider integration;
- marketplace real-time split payouts;
- complex archive access policies;
- advanced dispute automation;
- multi-provider billing orchestration;
- raw card processing inside the app by the product team.

## Architectural Solution

### New Entities

- `channels`
- `channel_members`
- `channel_invites`
- `channel_posts`
- `subscription_plans`
- `subscriptions`
- `subscription_entitlements`
- `subscription_events`
- `billing_transactions`
- `billing_ledger_entries`
- `creator_balances`
- `creator_payout_requests`
- `creator_payouts`
- `billing_refunds`

### Additional Billing Fields For Schetus

- `payment_provider`
- `provider_payment_id`
- `provider_customer_id`
- `provider_subscription_id`
- `checkout_session_id`
- `payment_status`
- `payment_method_type`

### Changes In Server

- add a domain module for channels;
- add a domain module for subscriptions;
- add a domain module for billing;
- store entitlement separately from financial accounting;
- enforce access checks for paid and private channels;
- implement payment session creation in `Schetus`;
- implement `Schetus` webhook and callback processing;
- implement payment reconciliation logic;
- implement ledger entries for financial accounting;
- implement creator balance calculation;
- implement admin flow for manual creator payouts;
- implement payout history;
- implement refund and reversal accounting.

### Changes In Mobile

- channel card screen;
- paywall screen;
- locked state screen;
- price and subscription status display;
- subscription flow through `Schetus`;
- payment status UI;
- subscription expiry and renew UI;
- creator-facing channel management screen;
- creator-facing revenue and balance screen;
- payout status block or screen.

## Payment And Entitlement Flow

1. User opens a paid channel.
2. User sees the paywall with the price and the `Subscribe` button.
3. The app opens the `Schetus` payment flow.
4. User completes payment through `Schetus`.
5. Server receives payment confirmation from `Schetus`.
6. Server creates or extends `subscription_entitlement`.
7. Entitlement opens access to the channel.
8. Billing layer separately records:
   - `gross amount`
   - `provider fee`
   - `service commission`
   - `creator net`
9. `creator net` is accrued into the creator balance.
10. Payout to the creator is handled manually by admin in the first version.

## Recommended Checkout Model

For the first version, the recommended checkout model is:

- `hosted Schetus checkout`
- or `secure Schetus SDK flow`

It is not recommended to start with raw card field processing directly inside the app.

## User Model

### For The End User

- user sees the channel;
- if the channel is free, it opens immediately;
- if the channel is paid, user sees price and subscription CTA;
- after payment through `Schetus`, access is opened;
- while subscription is active, the channel remains available;
- after expiration, access is closed.

### For The Channel Creator

- creator creates the channel;
- creator selects public or private visibility;
- creator selects free or paid access;
- creator sets the price and billing period;
- creator publishes content;
- creator receives paying subscribers;
- creator sees earnings, balance, and payout status;
- creator requests payout;
- creator receives money manually through the platform admin process.

## Financial Model

Base formula:

`gross amount - provider fee via Schetus - service commission = creator net`

Where:

- `gross amount` is the full amount paid by the user;
- `provider fee via Schetus` is the payment/acquiring cost related to the transaction;
- `service commission` is the platform's commission;
- `creator net` is the amount accrued to the channel creator.

## Manual Creator Payouts

In the first version:

- the system calculates what the creator is owed;
- the amount is accumulated in the internal creator balance;
- the creator requests payout or admin processes it;
- the admin pays the creator outside the product;
- the system records payout completion and payout history.

## Why Manual Payouts Are Acceptable In Version One

- they let monetization launch faster;
- they do not require payout provider integration from day one;
- they do not block the correct billing architecture;
- they work well with the ledger model;
- they preserve a clean path to future automation.

## How Automatic Payouts Can Be Added Later

Automatic payout can be added later without changing the base model if the system already has:

- `billing_ledger_entries`
- `creator_balances`
- `creator_payout_requests`
- `creator_payouts`

Then only the final payout execution layer changes:

- now: admin pays manually;
- later: payout service pays automatically.

## Risks

- if `Schetus` does not support recurring billing well, the subscription UX may degrade;
- if payment event delivery is weak, entitlements can drift from real payment state;
- if provider fee is not visible, creator accounting becomes less trustworthy;
- refunds and chargebacks can damage payout accuracy if not recorded into the ledger;
- admin tooling is required for manual payout operations;
- if the product later targets public mobile stores, the payment approach will require separate policy validation.

## Open Questions

- Does `Schetus` support recurring subscriptions or only one-time payments?
- Does `Schetus` support tokenized rebilling or saved payment method flows?
- Will checkout be hosted by `Schetus`, SDK-based, or custom?
- Which payment methods are included in version one?
- How are refunds reported to the product?
- How are chargebacks reported to the product?
- What exact provider fee model should be used in accounting?
- Is there a minimum payout threshold?
- Is there a hold period before creator funds become available?
- Is service commission global or configurable by channel type?

## Practical Rollout

### Phase 1

- channels domain;
- public/private and free/paid channel model;
- `Schetus` checkout integration;
- server entitlement flow;
- billing ledger;
- creator balance;
- admin-side manual payout flow.

### Phase 2

- subscription management improvements;
- refund and reversal automation;
- creator payout request UX;
- creator reporting improvements.

### Phase 3

- optional additional payment rails;
- optional automatic payouts;
- advanced monetization tools.

## Related Files

- `00-problem-and-goals.md`
- `01-solution-options.md`
- `02-billing-commission-payouts.md`
- `03-user-experience.md`
- `04-payments-options.md`
- `05-schetus-billing.md`
- `06-technical-architecture.md`
- `07-backend-implementation-plan.md`
- `08-prisma-schema-draft.md`

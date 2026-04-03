# Schetus Billing

## Context

On `2026-04-02`, the product decision changed:

- first-version payment rail is no longer `App Store / Google Play`;
- payment for channel subscriptions should go through the company's own service `Schetus`;
- the architectural base remains:
  - `Variant 3` for access and payment orchestration;
  - `Variant B` for ledger, creator balance, and manual payouts.

This document explains how `Schetus` fits into the chosen architecture.

## Working Assumption About Schetus

For this initiative, `Schetus` is treated as:

- the platform's own payment service;
- the main payment entry point for subscription purchases;
- the service that accepts payment events and returns payment status to the product;
- the source of provider-level payment identifiers and payment lifecycle updates.

If `Schetus` is internally built on top of a bank, acquiring provider, or PSP, that does not change the product architecture. The product should still integrate with `Schetus` as the single payment rail.

## Why Schetus Fits Variant 3 + Variant B

`Variant 3` is still a good match because the core idea is not "mobile store billing only".  
Its real value is that:

- access to the channel is controlled on the server;
- the payment source is separated from the entitlement model;
- the system can support more than one payment rail over time;
- the billing domain remains independent from the content access domain.

`Variant B` is still a good match because:

- the product needs creator earnings accounting;
- the product needs service commission accounting;
- the product needs creator balances;
- payouts to creators can still be manual in the first version.

The only thing that changes is the first payment rail:

- before: `App Store / Google Play`
- now: `Schetus`

## Recommended User Payment Flow

For the first version, the safest and simplest product flow is:

1. User opens a paid channel.
2. User sees the paywall with the price and the `Subscribe` button.
3. User taps `Subscribe`.
4. The app opens a secure `Schetus` checkout flow.
5. User completes the payment.
6. `Schetus` sends a payment confirmation to the server.
7. The server verifies the event and creates or extends the subscription entitlement.
8. The paid channel becomes available to the user.

## Recommended Checkout Model

For the first version, it is better to use:

- `hosted checkout page`
- or `secure Schetus SDK flow`

It is better not to build raw card form handling directly inside the app unless there is a very clear compliance plan.

Why:

- lower implementation risk;
- lower compliance burden;
- easier payment lifecycle handling;
- easier provider-side updates;
- easier rollback if checkout logic changes.

## What The User Sees

From the user's point of view:

- they open a paid channel;
- they see the price;
- they tap `Subscribe`;
- they go through the `Schetus` payment flow;
- after successful payment, access is opened.

The user should not see:

- internal creator accounting;
- service commission logic;
- internal ledger entries.

For the user, it should feel like a normal paid subscription flow.

## What The Server Must Do

The server should:

- create a payment session in `Schetus`;
- keep a link between internal subscription intent and provider payment id;
- receive payment status updates from `Schetus`;
- verify successful payment;
- create or renew `subscription_entitlement`;
- write billing events into the ledger;
- calculate creator earnings;
- update creator balance;
- support refund and reversal handling.

## Additional Data Needed In Billing

Compared with a generic billing flow, the product should explicitly store:

- `payment_provider = schetus`
- `provider_payment_id`
- `provider_customer_id` if available
- `provider_subscription_id` if recurring subscriptions are supported
- `checkout_session_id`
- `payment_status`
- `payment_method_type`
- `gross_amount`
- `provider_fee`
- `service_commission`
- `creator_net_amount`

## Financial Formula

The base formula becomes:

`gross amount - provider fee via Schetus - service commission = creator net`

Where:

- `gross amount` is the full user payment;
- `provider fee via Schetus` is the payment/acquiring cost associated with the purchase;
- `service commission` is the platform's commission;
- `creator net` is what is accrued to the channel creator.

## Creator Payouts In The First Version

Nothing changes here compared with `Variant B`.

The flow remains:

1. User pays for channel access.
2. The system records the billing event.
3. The system calculates creator net revenue.
4. The amount is accrued into the creator's internal balance.
5. The creator requests payout or the admin processes payout manually.
6. Admin pays the creator outside the product.
7. The product records payout status and payout history.

## What Needs To Exist In Schetus Integration

For the subscription model to work cleanly, the product needs `Schetus` to support or expose:

- payment session creation;
- payment success/failure callback or webhook;
- idempotent payment event delivery;
- recurring billing support or a clear replacement model;
- refund events;
- chargeback/dispute status if available;
- payment identifiers stable enough for reconciliation.

## Critical Product Questions About Schetus

These questions should be clarified before implementation:

- Does `Schetus` support recurring subscriptions or only one-time charges?
- Does `Schetus` support saved payment methods or tokenized rebilling?
- Is checkout hosted by `Schetus`, embedded by SDK, or fully custom?
- What payment methods are supported in the first version?
- How are refunds reported back to the product?
- How are chargebacks reported back to the product?
- What is the actual provider/acquiring fee model inside `Schetus`?
- Can the platform receive webhook events reliably for renewals and failed payments?

## Risks

- If recurring billing is not supported, the UX becomes closer to manual renewal instead of auto-renew subscription.
- If raw card entry is implemented directly inside the app, compliance and security complexity rise sharply.
- If webhook delivery is weak or not idempotent, subscription status will drift from real payment status.
- If provider fee is not visible, creator net accounting becomes weaker.
- If refunds and disputes are not propagated into the ledger, payout data will become unreliable.

## Practical Recommendation

For the first version:

- keep `Variant 3 + Variant B`;
- switch the first payment rail to `Schetus`;
- use hosted checkout or secure provider flow;
- keep server-side entitlement as the source of truth;
- keep manual creator payouts;
- make recurring support a hard gating question before implementation starts.

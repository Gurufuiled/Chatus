# Solution Overview

## Chosen Shape

`Internal Billing -> Loginus Account Type -> App Unlocks Access`

## Core Model

The flow is intentionally simple:

1. user completes payment through the internal billing service;
2. billing changes the user's account type in `Loginus`;
3. backend/app reads that updated account type;
4. feature gates unlock the relevant channel/group capabilities.

## Why This Shape Is Good For Version One

- it matches the latest boss guidance;
- it reuses an existing internal billing path;
- it does not block on external payment rollout;
- it avoids building a heavy finance subsystem too early;
- it gives a clean entitlement signal for the app.

## What The User Sees

### For A Regular User

- if the account type is basic, the user still has chats and communication;
- if the account type is paid/premium, the user sees extra capabilities open;
- locked actions show a clear upgrade/paywall state.

### For A Paying User

- after payment is processed, the account type changes;
- after the app refreshes auth/profile state, paid capabilities open;
- the user should not need to manage access manually.

### For A Creator/Admin User

- higher account tiers can unlock the ability to create groups/channels/publics;
- the app can hide or disable creation flows for lower tiers;
- later business rules can map tiers like `3000 / 9000 / 27000` to different rights.

## First-Rollout Scope

- internal billing is the payment rail;
- `Loginus account type` is the entitlement signal;
- mobile app reads and reacts to account type;
- backend guards creation/access rules based on account type;
- channel creation rights are tier-gated.

## Explicitly Out Of Scope For This Decision

- creator payout engine;
- creator revenue dashboard;
- ledger and commission accounting as mandatory version-one scope;
- external payment service as the primary first rail.

## Open Product Mapping To Confirm

The main remaining product question is the rights matrix:

- what each account type unlocks;
- whether rights apply only to channel/group creation or also to reading/joining certain premium surfaces;
- whether any channel-level paid membership still needs a separate access model later.

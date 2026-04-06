# Problem And Goals

## Context

The product direction changed again after an additional clarification from the boss:

- money should go through the company's internal billing;
- test payments already worked;
- production acceptance is not switched on yet, but the direction should be treated as viable;
- billing can change the user's account type in `Loginus`;
- the app should read that account type and unlock access/features.

This means the current discussion is no longer:

- external creator monetization first;
- external payment service first;
- or mobile store billing first.

The active direction is now:

- internal billing first;
- `Loginus account type` as the practical entitlement signal;
- app-side and server-side feature gating based on that account type.

## Main Goal

Design the first product/technical implementation for channels and paid access where:

1. payment is handled by the internal billing service;
2. billing updates the user's account type in `Loginus`;
3. the app reads that account type and unlocks channel-related capabilities;
4. the system stays simple enough for the first rollout.

## Product Goals

- unlock channel/group creation rights based on paid account type;
- keep ordinary messaging/chat access for non-paying users;
- support a clear locked/unlocked UX in the app;
- avoid waiting for a completely new external payment integration;
- avoid overbuilding creator payout logic before it is clearly required.

## Technical Goals

- make `Loginus account type` readable inside the app and backend;
- keep access logic deterministic and easy to debug;
- avoid fragile one-off checks spread across many screens;
- support future expansion if billing later grows into a deeper subscription platform.

## Non-Goals For The First Decision

- do not design a full marketplace payout engine yet;
- do not assume per-channel creator payouts are required in version one;
- do not assume external payment rails are the first rollout path;
- do not assume app-store billing is required for this product direction.

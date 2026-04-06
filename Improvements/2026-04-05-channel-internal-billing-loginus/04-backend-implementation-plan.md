# Backend Implementation Plan

## Goal

Implement the minimum backend/mobile path for:

- internal billing driven plan changes;
- `Loginus account type` sync;
- capability-based access for channel/group creation.

## Phase 1: Confirm The Integration Contract

Clarify exactly:

- where `account_type` is stored in `Loginus`;
- whether it already comes in the current auth/user payload;
- whether backend needs a separate fetch to `Loginus`;
- how quickly plan changes appear after payment;
- whether there is a webhook/event when billing changes the type.

## Phase 2: Expose Account Type In Backend

Backend tasks:

- add `account_type` to the normalized authenticated user model;
- include it in auth/session/profile responses;
- ensure refresh/login paths keep it current;
- add a thin mapping layer from raw account type to product capabilities.

Suggested modules/services:

- `auth/`
- `users/`
- `loginus/` or `account-types/` helper service

## Phase 3: Add Capability Guards

Backend should enforce:

- can create group;
- can create channel/public;
- can access other future premium channel actions.

Suggested implementation:

- `AccountCapability` enum or constant map;
- helper like `hasCapability(user, capability)`;
- Nest guards or service-level checks for protected endpoints.

## Phase 4: Add Channel/Product Capability Checks

When channels are implemented:

- `POST /channels` should require the right capability;
- `POST /groups` or equivalent should require the right capability;
- future admin/creator actions should also check capability server-side.

## Phase 5: Mobile Consumption

Mobile tasks:

- extend auth/user store with `accountType` and derived capabilities;
- update UI to show locked states for restricted actions;
- hide/disable create-channel/create-group actions when not allowed;
- refresh account state after login and after returning from payment flow if needed.

## Suggested Capability Mapping Table

Keep this product-configurable:

- `account_type -> can_create_group`
- `account_type -> can_create_channel`
- `account_type -> can_create_public_channel`
- `account_type -> other future premium flags`

This mapping should live in one place on the backend.

## Nice-To-Have But Not Required On Day One

- webhook from billing or Loginus when account type changes;
- admin debug endpoint to inspect current account type and derived capabilities;
- audit log of capability changes;
- forced client refresh when plan changes.

## Main Risk

The biggest implementation risk is not coding complexity.  
It is ambiguity around the exact source and freshness of `Loginus account type`.

So the first engineering step should be confirming that contract before deeper channel work starts.

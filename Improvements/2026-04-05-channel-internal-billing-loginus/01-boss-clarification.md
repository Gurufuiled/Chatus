# Boss Clarification Summary

## What Changed

The new clarification can be reduced to this:

- internal billing should be considered the active payment path;
- it already worked in test mode;
- the missing part is production enablement, not basic feasibility;
- billing can modify the user's account type in `Loginus`;
- the app should consume that type and open access accordingly.

## Plain-Language Interpretation

The boss is asking for a simpler first version than a full internal marketplace economy.

The system should behave like this:

1. user pays through internal billing;
2. billing updates the user's plan/account type in `Loginus`;
3. the app/backend reads the updated account type;
4. the product unlocks the correct rights.

## What This Probably Means In Practice

For version one, the most likely rights controlled by account type are:

- whether the user can create groups;
- whether the user can create channels/publics;
- whether the user gets premium channel-related capabilities;
- whether some locked surfaces should open.

## What This Does Not Force Us To Build Immediately

- creator ledger;
- creator balance;
- payout requests;
- manual payout admin flows;
- platform commission accounting.

Those may still appear later, but they are not implied by the latest clarification.

## Source Of Truth

For the current direction, the practical entitlement source should be:

- `Loginus account type`

not:

- local-only mobile flags;
- ad-hoc manual switches inside the app;
- external payment provider state directly inside UI.

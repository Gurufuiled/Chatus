# System Patterns

## Architecture
```text
mobile/ (Expo React Native)      server/ (NestJS)
|- Zustand stores                |- Prisma + PostgreSQL
|- SQLite (expo-sqlite)          |- WebSocket gateway (4001)
|- WebSocketService              |- Signaling (4002)
|- TransportService              |- Auth / Chats / Messages / Upload
|- SyncService                   |- HTTP API (4000)
\- Screen orchestration          \- Prisma migrations
```

## Key Patterns
1. **Offline-first messaging**
   - mobile keeps local SQLite as the immediate UI source
   - queued actions replay through `SyncService`
   - server is still the current cross-device source of truth
2. **Shared chat model for direct + group chats**
   - groups reuse the same chat/message transport surface as private chats
   - the main discriminator is `chat_type: 'group'`
   - group-specific metadata layers on top:
     - `description`
     - members
     - member `role`
     - member `tag`
     - member `tag_color`
3. **Screen as orchestration, components as visual/runtime slices**
   - heavy screens should coordinate state and side effects
   - focused child components should render specific surfaces
   - this pattern now exists in:
     - `ChatScreen`
     - `ChatProfileScreen`
     - `GroupProfileScreen`
4. **Group profile is a derived chat-detail surface**
   - it does not have a separate group-media backend yet
   - `participants` come from chat member data
   - `media / files / voice` are derived from the group's loaded message history
   - navigation back to the source message is handled by returning to `Chat` with `focusMessageId`
5. **Anchored popover menus over bottom sheets where Telegram-like precision matters**
   - profile/group `More` actions use anchored popovers
   - participant long-press menus also use anchored popovers
   - the popover component handles alignment and animation for both cases
6. **Server-backed group metadata**
   - group `description` lives on the server + Prisma
   - member `tag` and `tag_color` also live on the server + Prisma
   - mobile persists them locally in SQLite for fast rendering
7. **SQLite migration plus schema repair**
   - normal migrations still rely on `PRAGMA user_version`
   - but startup also repairs missing columns when older local DBs drifted
   - this matters for fields like:
     - chat `description`
     - member `tag_color`
8. **Capability-based channel direction**
   - current channel planning is not payout-first
   - internal billing updates `Loginus account type`
   - app/backend should derive creation/access capabilities from that account type

## Important Current Data Flows

### Group Creation
- user long-presses the `Chats` tab
- quick action opens create-group flow
- mobile collects initial participants + name
- server already supports `chat_type: 'group'`
- created group is persisted locally and appears in the normal chat surface

### Group Profile
- entry point is the group chat header
- screen fetches the latest group chat data via existing chat APIs
- local message history enriches the profile tabs
- owner-only actions update server state, then reconcile local stores/SQLite

### Group Member Tags
- long-press participant
- open tag editor
- save `tag` + optional `tag_color`
- server persists
- mobile updates local chat/member state
- participant list renders the tag as a right-aligned badge

### Group Profile Media / Files / Voice
- source data is derived from `messageStore` for the current chat
- media opens a fullscreen viewer
- files try to open directly, then fall back to `Show in chat`
- voice can play inline or jump to the source message

## Practical Notes
- `GroupProfileScreen` is now a coordinator, not a monolith.
- Group profile components now live under `mobile/src/components/group-profile/`.
- Group-profile tabs are only as complete as the currently loaded local history.
- New memory-bank updates should continue to prefer clean UTF-8 text over preserving old mojibake-heavy wording.

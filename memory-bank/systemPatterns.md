# System Patterns

## Architecture
```text
mobile/ (Expo React Native)      server/ (NestJS)
|- Zustand stores                |- Prisma + PostgreSQL
|- SQLite (expo-sqlite)          |- WebSocket gateway (4001)
|- WebSocketService              |- Signaling (4002)
|- TransportService              |- Auth / Chats / Messages / Upload
|- SyncService                   |- HTTP API (4000)
\- Chat UI orchestration         \- Prisma migrations
```

## Key Patterns
1. **Offline-first messaging**
   - local persistence in SQLite
   - queued actions through sync queue
   - reconnect replay through `SyncService`
2. **Transport routing**
   - `TransportService` chooses `P2P -> WebSocket -> SyncQueue`
   - P2P still optional and disabled by default for MVP
3. **Server snake_case contract**
   - server responses use snake_case
   - mobile row/store models stay close to that shape
4. **ChatScreen as orchestration layer**
   - `ChatScreen` should own screen-level state and chat-specific side effects, not every visual layer directly
   - extracted UI layers now include:
     - `ChatMessageList`
     - `ChatTopBanners`
     - `ChatContextMenuOverlay`
     - `ChatInputDock`
     - `ChatForwardSheet`
     - `chatScreen.shared.tsx` for screen constants/helpers/background
   - bubble components stay focused on their own internal rendering
   - the goal of extraction is both maintainability and better render isolation, not file splitting for its own sake
5. **Realtime chat actions**
   - send/delete/pin flow over WebSocket events
   - optimistic local update on mobile
   - server broadcast reconciles chat state for all members
6. **Profile screen as chat-adjacent detail surface**
   - `ChatsStack` owns entry into `ChatProfile`
   - profile data is fetched separately from `/users/:id`
   - chat-derived local data still enriches the screen:
     - presence from `uiStore`
     - local block state from `uiStore.blockedUserIds`
     - media/files/voice/links derived from `messageStore`
     - mute state from `chatStore`
     - local delete flow through `chatStore.removeChat`
7. **Cross-surface message navigation**
   - non-chat screens can deep-link back into `Chat` with a specific `focusMessageId`
   - `ChatScreen` owns the actual scroll and temporary highlight behavior
   - source surfaces only need to know the originating message id
8. **ChatScreen top-surface modes**
   - `ChatScreen` can temporarily switch into non-default top content under the header
   - current examples:
     - in-chat search mode started from profile via `startSearch`
     - active voice playback banner scoped to the current chat
   - these surfaces are state-driven inside `ChatScreen`, not separate routes
9. **Global call orchestration**
   - calls are not owned by a single screen
   - `CallProvider` is mounted at app level and can show an overlay above navigation
   - profile screens only trigger `startCall(...)`
   - signaling / WebRTC state lives in the provider, not inside `ChatProfileScreen`
10. **Narrow subscriptions over wide provider churn**
   - hot realtime UI should subscribe as narrowly as possible to the specific data it needs
   - voice playback UI is a good example:
     - controls can remain stable
     - playback state should be observed as locally as possible
     - voice rows/bubbles should not re-render just because some other clip is ticking
11. **Heavy composer UI should be split by mode**
   - `InputBar` should not own every runtime branch inline
   - attachment UI and recording UI are now isolated into dedicated components
   - the composer shell remains the coordinator, while heavy mode-specific rendering lives below it
12. **Profile screen should mirror chat decomposition strategy**
   - `ChatProfileScreen` should orchestrate
   - hero/media/overlay layers live in separate components
   - this keeps profile-specific polish from turning into another monolithic screen file
13. **P2P migration should classify features by state type, not by current endpoint**
   - use the model documented in `docs/hranenie.md` (локально, не в Git)
   - treat features as one of:
     - message events
     - chat-state events
     - user/device-local state
     - derived views over synced local history
   - do not assume that a current server field or endpoint should survive unchanged in a P2P architecture
14. **Mailbox is the preferred current compromise for offline delivery**
   - direct P2P should remain the primary path
   - mailbox should be treated as encrypted temporary store-and-forward, not chat source of truth
   - mailbox fits text, reply, forward, delete, read-state events, and some lightweight metadata better than large media blobs
15. **Rust is now an optional server-side media engine, not a replacement for NestJS**
   - NestJS remains the orchestration and API layer
   - Rust handles heavy media/binary inspection and preparation
   - the boundary is intentionally narrow:
     - upload enters NestJS
     - saved file is inspected/prepared by `media-worker`
     - normalized metadata comes back to NestJS as JSON
     - server persists/maps the result for mobile clients
   - the Rust path must always have a safe fallback to plain server behavior
16. **First channel monetization rollout should separate access control from payment execution**
   - the app should not assume built-in creator billing for the first release
   - account plans decide whether a user can create channels/groups
   - external payment confirmation decides whether a member should retain channel access
   - the messenger remains responsible for membership state, moderation, and removal, not for acting like a bank

## Important Current Data Flows

### Reply
- `ChatScreen` sets `replyToMessageId`
- `InputBar` shows reply preview
- `TransportService` sends `reply_to_id`
- server saves `replyToId`
- mobile renders reply snippet inside the target bubble

### Forward
- long-press menu opens forward action
- `ChatScreen` controls forward state, but `ChatForwardSheet` renders the picker UI
- `TransportService.forwardMessage` reuses `send_message`
- offline forwarding is queued through `SyncService`

### Forward Source Metadata
- forwarded messages now persist source identity as server-backed message metadata, not as temporary UI-only text
- current source fields include:
  - `forwarded_from_message_id`
  - `forwarded_from_name`
  - `forwarded_from_chat_id`
  - `forwarded_from_sender_id`
- mobile uses this metadata for:
  - forwarded header rendering
  - source-aware navigation
  - preserving provenance across sync, reconnect, and other devices

### Multi-Select and Bulk Actions
- selection mode is owned by `ChatScreen`
- `ChatMessageList` renders the selection affordances and per-row check state
- `ChatTopBanners` owns the top selection pills/count surface
- bottom bulk actions (`Delete`, `Forward`) live outside the list rows so selection remains a screen-level mode, not a bubble-local state
- inline delete confirmation stays within the blur/menu overlay instead of dropping to a separate system alert

### Pinned Message
- source of truth is now the chat row itself via `pinned_message_id`
- server:
  - Prisma `Chat.pinnedMessageId`
  - websocket event `pin_message`
  - broadcast `chat_pinned_message_updated`
  - clearing pin automatically when pinned message is deleted
- mobile:
  - `chatStore` holds `pinned_message_id`
  - `ChatScreen` reads current chat from `chatStore`
  - pinned banner is rendered from that server-backed state
  - tapping banner scrolls to the pinned message

### Peer Profile
- navigation:
  - tapping chat header title or avatar in `ChatsStack` opens `ChatProfile`
- server:
  - `GET /users/:id` returns mapped user profile data for the peer
  - private chats expose peer avatar through `chat.avatar_url`
- mobile:
  - `ChatProfileScreen` fetches profile data with `getUserProfile`
  - combines remote profile data with local realtime/state stores:
    - `uiStore.presenceByUserId`
    - `chatStore` for mute and chat metadata
    - `messageStore` for media/files/voice/links tabs
  - media tab supports fullscreen preview via local modal state
  - files and voice tabs use chat-derived rows, not separate backend endpoints
  - long-press on media/files/voice/links opens a compact local action menu
  - choosing `Show in chat` navigates back with `focusMessageId`
  - `ChatScreen` scrolls to the message and applies a temporary highlight state
  - `More` opens local actions for:
    - block / unblock persisted in `uiStore`
    - delete chat locally via `chatStore.removeChat`
    - delete-for-both kept as UX-only until backend support exists
  - quick actions:
    - `Call` now starts a real in-app audio call via `CallProvider`
    - `Video` was removed from the profile quick-action row
    - `Search` and `Mute` remain chat-adjacent actions

### Profile Links Filtering
- the profile `Links` tab is a derived view over message content, not a primary backend entity
- it now intentionally filters out non-user-meaningful URLs such as:
  - local/private IP addresses
  - `localhost`
  - internal upload URLs
  - deleted-message content
- the goal is to keep the tab user-facing and internet-link-oriented instead of exposing raw infrastructure URLs

### In-Chat Search
- source of entry:
  - profile search action navigates to `Chat` with `startSearch: true`
- mobile:
  - `ChatScreen` turns on a top search bar under the header
  - the actual top-surface rendering now lives in `ChatTopBanners`
  - input auto-focuses and keyboard opens
  - local matching is based on currently loaded message text content
  - current behavior scrolls to the first match only

### Audio Calls
- trigger:
  - profile `Call` action calls `startCall({ userId, displayName, avatarUrl, chatId })`
- mobile:
  - `CallProvider` requests microphone access, creates local audio stream, and manages `RTCPeerConnection`
  - full-screen overlay renders outgoing / incoming / connecting / active states
  - overlay supports accept, decline, end, and local mic mute
  - `VoicePlayerService.stop()` is called before call setup so voice playback does not conflict with call audio
- signaling:
  - existing signaling server on `4002` relays `offer`, `answer`, `ice`
  - additional call lifecycle events now exist:
    - `call_cancel`
    - `call_decline`
    - `call_end`
    - `call_busy`
  - mobile `SignalingService` now uses Nest-style `{ event, data }` payloads for outgoing signaling events
- current scope:
  - app-level in-app calling only
  - no system incoming-call UI or background wake-up yet
 - P2P note:
   - media may become peer-to-peer
   - signaling and connectivity help will likely remain hybrid in practice

### Rust Media Worker
- server entry:
  - `UploadController` receives multipart upload
  - `UploadService` saves file to `uploads`
  - `RustMediaWorkerService` optionally calls the Rust binary
- Rust worker responsibilities:
  - format detection
  - media kind normalization
  - image dimensions
  - audio/video duration where supported
  - `wav` waveform generation
  - image thumbnail generation
- server responsibilities after Rust returns:
  - normalize fallback values
  - keep API contract stable for mobile
  - persist media fields such as `thumbnail_url`
  - map the richer metadata back through HTTP + WebSocket responses
- mobile responsibilities:
  - consume richer upload/message metadata when available
  - decode persisted waveform safely
  - remain compatible when Rust is disabled and fallback metadata is simpler

### Voice Playback
- shared playback state is owned by `VoicePlayerService` + `VoicePlayerContext`
- current capabilities:
  - play / pause
  - playback-rate switching (`1x / 1.5x / 2x`)
  - replay from start after completion without switching messages
  - tap-to-seek on waveform
- UI surfaces:
  - `VoiceBubble` renders local waveform and seek behavior
  - `ChatTopBanners` renders the top banner for the currently active voice message in this chat
- optimization note:
  - playback updates should be scoped so one actively playing voice clip does not invalidate unrelated voice rows

### ChatScreen Decomposition
- `ChatMessageList`
  - owns list rendering, memoized message rows, and swipe-to-reply UI
- `ChatTopBanners`
  - owns selection/search/pinned/voice top-surface rendering
- `ChatContextMenuOverlay`
  - owns blur backdrop, long-press preview, reactions, and action-card rendering
- `ChatInputDock`
  - owns the bottom composer shell and keyboard-following visual layer
- `ChatForwardSheet`
  - owns the forward-target sheet UI
- `chatScreen.shared.tsx`
  - owns stable constants and pure helpers shared by the screen and extracted layers
- `ChatScreen`
  - still owns business logic, refs, animation triggers, and transport/navigation callbacks

### InputBar Decomposition
- `InputAttachmentSheet`
  - owns attachment-picker sheet UI and gallery rendering
- `InputVoiceRecordingStage`
  - owns recording-mode visuals and timer-driven recording state rendering
- `InputBar`
  - still owns composer-level coordination, send handlers, and transition between modes

### Chat List Optimization
- `ChatListRow`
  - memoized row component for chat list
  - should derive only the data needed for that specific chat row
- `ChatListScreen`
  - should avoid subscribing to wide message collections when only per-row preview data is needed

### ChatProfileScreen Decomposition
- `ChatProfileHero`
  - hero/avatar/quick-actions area
- `ChatProfileMediaSection`
  - tabs and media/files/voice/links content
- `ChatProfileOverlayLayer`
  - fullscreen media viewer, item action menu, and more-menu overlays
- `ChatProfileScreen`

### Channel Access Direction (planned)
- creator rights should be gated by account plan/tier, not by ad-hoc feature flags
- member access to paid channels is expected to come from an external payment system plus app-side allowlist control
- the first rollout should focus on:
  - channel creation rights
  - private/public channel visibility
  - membership allowlist and removal
  - admin/API control over who is allowed inside
- internal creator ledger / payout logic is no longer the preferred first milestone
  - now coordinates navigation, profile fetch, store-derived data, and action handlers

### P2P Mapping for Current Features
- good fits for message-event sync:
  - text
  - reply
  - forward
  - delete message
  - media metadata for `image`, `voice`, `file`, `video_note`
- better treated as chat-state events:
  - pin / unpin message
  - read / delivered cursors
  - membership-style shared state
- better treated as user-local or own-device-synced preferences:
  - mute chat
  - pin chat in chat list
  - block user
  - local delete-chat view state
- better treated as derived views:
  - in-chat search
  - profile tabs `media / files / voice / links`
  - unread badge derived from read state
  - jump-to-message and playback UI

## Mobile public config (release-safe)
- **`app.config.js`** читает **`mobile/.env`** и кладёт `EXPO_PUBLIC_*` в **`expo.extra`**.
- **`mobile/.env.example`** в Git содержит пример прод-конфига и шаги для Xcode; реальный **`mobile/.env`** не коммитится.
- **`config.ts`** сначала читает **`Constants.expoConfig.extra`**, затем `process.env`, чтобы release-сборки на Hermes всегда видели прод-API URL.
- WebSocket URL строится с хоста API: порты **4001** (чат), **4002** (signaling).
- Подмена хоста на **`10.0.2.2`** (эмулятор Android) выполняется **только** при **`EXPO_PUBLIC_USE_EMULATOR=true`**; авто-детект через `Constants.isDevice` для этого больше не используется (на части устройств он давал ложный «эмулятор» и ломал вход).

## iOS native project (tracked)
- **`mobile/ios/`** в репозитории: CocoaPods (**`Podfile`**, **`Podfile.lock`**), workspace **`.xcworkspace`**, не только prebuild у себя.
- На Mac: **`./open-in-xcode.sh`** или **`npx expo run:ios`** после **`npm install`** и при необходимости **`pod install`**.
- Ruby — это язык **CocoaPods** и скриптов RN для iOS, не бизнес-логика приложения.

## Practical Notes
- The old local-only pinned state in `uiStore` is no longer the active source of truth for chat pinning.
- Jump-to-pinned currently depends on the pinned message being loaded in the current message batch.
- Profile-to-chat jumps currently also depend on the target message being present in the currently loaded chat batch.
- Wallpaper is a real local image asset, not a generated decorative background anymore.
- `mobile` typecheck is currently green; the old navigator `id` typing issue is no longer an active blocker.
- Private chat avatar rendering depends on server-side peer avatar mapping in `mapChat`, not only on local UI fallback logic.
- Local block / unblock and `Delete for me` are intentionally device-local behaviors right now.
- Voice seeking currently uses tap-based seeking; there is no drag scrubber yet.
- In-app calls currently depend on both apps being open and connected to signaling; they are not yet a push-driven background call system.
- `ChatScreen` is already significantly decomposed; future extractions should be justified by render isolation or clarity, not done mechanically.
- `ChatProfileScreen` now follows the same orchestration-first pattern as `ChatScreen`; new profile polish should prefer improving extracted components instead of growing the screen file again.
- The broader optimization pass was documented in `docs/optimization.md` (папка `docs/` сейчас не в репозитории — только локально).
- The broader P2P migration model is in `docs/hranenie.md` (так же локально).
- Rust Step 2 (server media worker) завершён; детальный отчёт был в `steps/step2.md` (локально). Step 3 (mobile/native Rust) не начат.
- Memory bank files should continue to be maintained only in UTF-8.

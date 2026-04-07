# Progress

## Working
- [x] Private chats with realtime text/media/file/voice flows
- [x] Reply, forward, delete, pin, selection mode, and jump-to-message UX
- [x] Peer profile with media/files/voice/links and jump-back into chat
- [x] In-app audio calls with signaling and app-level call overlay
- [x] Group chat creation flow on mobile
- [x] Group chat header/profile flow
- [x] Group description editing
- [x] Group avatar/title editing for owner
- [x] Group add-members flow for owner
- [x] Group leave/delete actions
- [x] Group participant long-press actions
- [x] Group member custom tags
- [x] Group member tag colors
- [x] Group profile tabs:
  - participants
  - media
  - files
  - voice
- [x] Group profile media fullscreen viewer
- [x] Group profile file open / show-in-chat behavior
- [x] Group profile voice inline playback / show-in-chat behavior
- [x] Group profile sticky compact header on scroll
- [x] Group profile screen decomposed into focused components
- [x] Local SQLite repair path for drifted group-related columns
- [x] Shared custom SVG profile action icons for peer + group profiles
- [x] Group-chat sender identity in chat:
  - colored sender names
  - incoming avatar markers
  - clearer multi-user presentation
- [x] Video-note recording flow on mobile:
  - mic/video mode toggle
  - Telegram-like recording stage with blur backdrop
  - compact send/cancel control bar
- [x] Inline expandable video-note playback bubble in chat
- [x] Video-note auto-collapse after playback ends
- [x] Channel strategy updated to internal billing + `Loginus account type` gating

## In Progress / Partial
- [ ] Full group roles/permissions model beyond owner-only flows
- [ ] Deep-history support for group profile media/files/voice tabs
- [ ] Remaining mojibake cleanup in older UI files
- [ ] Final polish of group/profile copy and labels
- [ ] Account-type capability implementation for channel/group/public creation rights
- [ ] Viewport-aware video-note expansion so opened circles stay comfortably in-frame
- [ ] Final Telegram-like motion polish for circles / richer video-note UX
- [ ] Video-call flow

## Remaining
- [ ] Private channels with real capability gating from internal billing/account type
- [ ] Mini app / bot work
- [ ] System-level incoming-call behavior
- [ ] P2P migration beyond the current server-first hybrid model

## Known Issues
1. Group profile `Media / Files / Voice` reflect the currently loaded local message history, not a full server-side media index.
2. Group profile edit/tag features require the updated backend schema and migrations on the server.
3. Group permissions are still simplified; owner/admin/member rights are not fully modeled yet.
4. Video-note recording requires native rebuild alignment because of the `expo-camera` plugin / permission setup in `app.json`.
5. Inline expanded video notes currently reflow surrounding messages, but do not yet auto-scroll the viewport if the expanded circle lands too close to the screen edge.
6. Some older Russian strings still need UTF-8 cleanup.

## Latest Validation
- `server` build passes after the group-related backend changes.
- `mobile` `node --max-old-space-size=8192 .\\node_modules\\typescript\\bin\\tsc --noEmit` passes after the latest video-note + chat UI work.
- Group-related Prisma migrations now present:
  - `20260405094340_add_group_description`
  - `20260405153000_add_chat_member_tag`
  - `20260405184500_add_chat_member_tag_color`
- Mobile local DB schema now tracks `DB_VERSION = 8`.

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
- [x] Channel strategy updated to internal billing + `Loginus account type` gating

## In Progress / Partial
- [ ] Full group roles/permissions model beyond owner-only flows
- [ ] Deep-history support for group profile media/files/voice tabs
- [ ] Remaining mojibake cleanup in older UI files
- [ ] Final polish of group/profile copy and labels
- [ ] Account-type capability implementation for channel/group/public creation rights
- [ ] Circles / richer video-note polish from the new sprint
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
4. Some older Russian strings still need UTF-8 cleanup.

## Latest Validation
- `server` build passes after the group-related backend changes.
- `mobile` `npx tsc --noEmit` passes after the final `GroupProfileScreen` decomposition.
- Group-related Prisma migrations now present:
  - `20260405094340_add_group_description`
  - `20260405153000_add_chat_member_tag`
  - `20260405184500_add_chat_member_tag_color`
- Mobile local DB schema now tracks `DB_VERSION = 8`.

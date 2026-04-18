# System patterns

- **Input attachment UI:** `InputBar` + `InputAttachmentSheet` (Modal); gallery backdrop intentionally transparent (no dim scrim).
- **Channel profile (subscriber):** Mute + leave in `ChannelProfileScreen` toolbar; leave uses `ChannelUnsubscribeConfirmModal` (not system `Alert`).
- **Chat/group profile mute icon:** `ChatProfileHero` / `GroupProfileHeaderSection` — mute state changes glyph only (`ProfileActionIcon` + `iconOnlyActive`), no filled accent pill for muted.
- **Message text channel URLs:** `channelDeepLink.ts` + `ChannelLinkRichMessage`; parses `c/` and `join/` paths across schemes.

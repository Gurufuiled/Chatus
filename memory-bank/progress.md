# Progress

## Working
- [x] Telegram-like message selection mode with animated checkmarks and floating bulk actions
- [x] Inline delete confirmation inside the blur/menu surface instead of a plain system alert
- [x] Forwarded-message header with preserved server-backed source metadata
- [x] Clickable forwarded-source header that can open source chat/message or fall back to peer profile
- [x] Profile `Links` tab now filters out local/private/upload/dev URLs
- [x] Profile media-section pills no longer stretch downward on press/switch
- [x] Channel monetization direction reframed around account plans + external payments + app-managed access control
- [x] Android **release APK** из `mobile/android` (`assembleRelease`) с вшитым бандлом и прод-`EXPO_PUBLIC_*` через `app.config.js` → `expo.extra`
- [x] Исправлена релизная авторизация/OAuth-вход: конфиг API больше не деградирует к `localhost` / `10.0.2.2` на физических устройствах
- [x] Бэкенд под Docker Compose задеплоен на VPS (типично `/root/chatus/server`, порты 4000–4002)
- [x] Изменения по мобильному конфигу/серверным примерам запушены в **Startupus-Team/chatus** (`main`)
- [x] Мерж **dev-vlad**: **`mobile/ios/`** в Git (Podfile, workspace, патчи patch-package, `open-in-xcode.sh`, bootstrap UI + error boundary, ATS для прод-VPS)
- [x] **`mobile/.env.example`** с прод API / Loginus id и инструкцией для Xcode — в репо для онбординга
- [x] Корневые **`docs/`** и **`steps/`** убраны из отслеживания Git (остаются локально)
- [x] Loginus OAuth
- [x] JWT auth and refresh
- [x] Chat list with previews and timestamps
- [x] Chat screen with text sending
- [x] WebSocket realtime for messages, typing, presence, ack
- [x] Voice messages
- [x] Video notes
- [x] File messages
- [x] Photo messages with upload and preview flow
- [x] Local SQLite storage
- [x] Sync queue and reconnect sync
- [x] Reply flow end-to-end
- [x] Message delete via WebSocket
- [x] Long-press message menu
- [x] Real chat wallpaper asset
- [x] Blur-backed Telegram-like action menu
- [x] Forward message flow with chat picker
- [x] Server-synced pinned messages
- [x] Tap pinned banner to scroll to pinned message
- [x] Private chat avatars resolved correctly for the peer account
- [x] Peer profile screen opened from chat header
- [x] Telegram-like profile header with avatar, status, and quick actions
- [x] Profile media section with tabs and fullscreen media viewer
- [x] Profile files and voice tabs polished closer to Telegram UX
- [x] Long-press `Show in chat` action from profile media/files/voice/links
- [x] Jump from profile item back to chat with target-message highlight
- [x] Compact animated profile context menu
- [x] Local persistent block / unblock from profile `More`
- [x] Local `Delete for me` chat action from profile `More`
- [x] Profile search button opens real in-chat search mode
- [x] In-chat search bubble with auto-focus and cancel
- [x] Top voice playback banner in chat with playback speed control
- [x] Voice replay after finish without switching to another clip
- [x] Voice waveform tap-to-seek
- [x] Larger, less compressed photo previews in chat
- [x] Video quick action removed from peer profile
- [x] In-app audio calls from peer profile
- [x] Global call overlay for incoming / outgoing / active states
- [x] Call accept / decline / end / mute flow
- [x] Signaling client/server alignment for call events and ICE relay
- [x] Mobile navigator typing issues cleaned up; `mobile` typecheck is green
- [x] `ChatScreen` decomposed into smaller UI layers:
  - `ChatMessageList`
  - `ChatTopBanners`
  - `ChatContextMenuOverlay`
  - `ChatInputDock`
  - `ChatForwardSheet`
  - `chatScreen.shared.tsx`
- [x] Voice playback/render path optimized:
  - narrower playback subscriptions
  - `VoicePlayerService` / `VoicePlayerContext` cleanup
  - `VoiceBubble` render pressure reduced
- [x] `InputBar` decomposed into smaller UI layers:
  - `InputAttachmentSheet`
  - `InputVoiceRecordingStage`
- [x] Chat list rendering optimized with memoized `ChatListRow`
- [x] `CallContext` ticking isolated so active calls do not broadly re-render the app
- [x] `ChatProfileScreen` decomposed into smaller UI layers:
  - `ChatProfileHero`
  - `ChatProfileMediaSection`
  - `ChatProfileOverlayLayer`
- [x] `ChatProfileScreen` legacy inline tabs/overlay/styles cleaned up after decomposition
- [x] Optimization summary documented in `docs/optimization.md`
- [x] `docs/hranenie.md` rewritten in clean UTF-8 and updated to reflect the current messenger feature set for future P2P planning:
  - message events vs chat-state events
  - user-local state vs derived views
  - mailbox as the current preferred offline-delivery compromise
  - current server-backed features called out where they are not the final P2P model
- [x] Rust Step 2 completed:
  - Rust workspace + `media-worker` introduced
  - Nest upload pipeline integrated with optional Rust worker path
  - richer metadata extraction for image/audio/video formats
  - server-side image thumbnail generation
  - Rust waveform path connected through persistence and mobile decode
  - voice upload path hardened and verified working again with Rust enabled
  - `steps/step2.md` rewritten to match the actual implemented result

## In Progress / Partial
- [ ] Channel/account-plan access-control implementation has not started yet; the current state is architectural/planning only
- [ ] Final polish of reply snippet visuals inside bubbles
- [ ] Final cleanup of some mojibake Russian strings left in older chat/profile UI code
- [ ] Better pinned-message UX when the target message is older than the currently loaded batch
- [ ] Additional Telegram-like visual polish for chat interactions
- [ ] Make remaining profile quick actions fully real, not partial placeholders
- [ ] Richer in-chat search navigation beyond the first match
- [ ] Telegram-like visual polish for the in-app call screen
- [ ] System-level incoming call behavior beyond the in-app overlay
- [ ] Optional final cleanup of leftover `ChatScreen` inline helpers/styles after the main decomposition pass
- [ ] Final on-device FPS validation after the current decomposition pass
- [ ] Further recording-flow optimization if `InputBar` voice UX still shows dropped frames on device
- [ ] Decide when to start Rust Step 3 (mobile/native Rust) after the team finishes broader testing of the current app

## Remaining
- [ ] iOS: подпись, загрузка в App Store Connect и раздача через **TestFlight** (или ad hoc); при желании вывести **EAS Build**
- [ ] Stable Android emulator / Hermes flow
- [ ] SLO / logout flow cleanup
- [ ] Post-logout redirect handling in Loginus
- [ ] Production-ready P2P mode
- [ ] Broader multi-device sync polish beyond current chat actions
- [ ] Replace current server-backed assumptions for pin/read/profile/call signaling with the eventual P2P or hybrid equivalents

## Known Issues
1. Jump-to-pinned only works when the pinned message is present in the current loaded message array.
2. Some chat/profile UI strings still need UTF-8 cleanup from earlier broken encoding.
3. Several profile quick actions are still placeholder actions and need real wiring.
4. Profile `Show in chat` relies on the source message already being available in the local chat message set for a perfect jump experience.
5. Profile block / unblock and delete-for-both are not server-backed yet.
6. In-chat search only searches the currently loaded local message batch and scrolls to the first match.
7. Current audio calls require the app to be open on both devices; there is no background wake-up / push / CallKit flow yet.
8. `ChatScreen` is much less overloaded than before, but final on-device validation is still needed after the broader optimization pass.
9. `InputBar` recording UX remains one of the heaviest remaining interaction surfaces and may need another optimization pass later.
10. `docs/hranenie.md` is now current, but the app architecture itself is still server-first; the document is a migration guide, not a completed implementation.
11. Rust Step 2 is production-shaped and working, but video thumbnails and deeper media-edge-case polish are still optional follow-ups rather than completed deliverables.
12. `mobile/.env` is gitignored; release builds need local `.env` or CI secrets. Пути `icon` / `splash` из `app.json` закрыты закоммиченными ассетами в **`mobile/assets/`**; полноразмерный фон логина — **`mobile/assets/splash/auth-bg-clean.png`** (не путать с однопиксельными заглушками).

## Latest Validation
- Prisma migrations for forwarded-message metadata and source refs were applied locally:
  - `20260404000100_add_message_forward_metadata`
  - `20260404000200_add_message_forward_source_refs`
- Prisma client had to be regenerated normally after a temporary `--no-engine` generate caused local `prisma://` datasource expectations.
- Local server DB connectivity was revalidated against Docker Postgres on `127.0.0.1:55432`.
- `server` `npm run build` passes.
- Prisma migration for pinned message was successfully applied.
- `mobile` `tsc --noEmit` проходит в нормальной среде; на отдельных Windows-сборках возможен **Node heap OOM** (см. techContext).
- `mobile` `tsc --noEmit` remained green after each `ChatScreen` extraction step.
- `mobile` `tsc --noEmit` remained green after the later optimization/decomposition work on chat list, input, voice, call overlay, and profile.
- Rust/media pipeline validation now also includes:
  - `cargo test` for the media worker
  - `server` `npm run build`
  - `mobile` `tsc --noEmit -p mobile/tsconfig.json`
  - runtime validation that voice upload again reaches `/upload` and `send_message` with Rust enabled

# Tech Context

## Local Dev Notes
- Local Postgres for the dev server is expected at `127.0.0.1:55432`.
- Typical local flow:
  - `cd server`
  - `docker compose up -d db`
  - `npm run start:dev`
- Phone/device access to the API is separate from DB access:
  - mobile uses the host LAN IP such as `192.168.x.x`
  - Nest/Prisma still talks to local Postgres on `127.0.0.1:55432`

## Prisma / Server Notes
- Forwarded-message migrations:
  - `20260404000100_add_message_forward_metadata`
  - `20260404000200_add_message_forward_source_refs`
- Group-related migrations:
  - `20260405094340_add_group_description`
  - `20260405153000_add_chat_member_tag`
  - `20260405184500_add_chat_member_tag_color`
- If Prisma Client is generated with `--no-engine`, local runtime can start expecting `prisma://` / Accelerate-style URLs.
- For this repo's normal local setup, Prisma Client should be generated normally so `postgresql://...` continues to work.

## Mobile / SQLite Notes
- Mobile local DB schema is now at `DB_VERSION = 8`.
- Startup DB init now does two things:
  - normal `user_version` migration path
  - schema-repair pass for drifted installs
- This protects older local installs from crashes when columns like these are missing:
  - chat `description`
  - member `tag_color`

## Mobile Chat UX Notes
- Group incoming message presentation now depends on local member data for:
  - sender name
  - sender avatar
  - sender display color
- Profile quick actions use a shared custom SVG icon set so peer + group profile surfaces stay visually aligned.
- Video-note recording now relies on:
  - `expo-camera`
  - permission strings / plugin setup in `mobile/app.json`
  - rebuild of the native app when those native config changes move
- Video-note playback currently uses inline circular expansion in `VideoNoteBubble` instead of a modal-style fullscreen viewer.

## Video-Note Implementation Notes
- Input mode switching and recording stage live across:
  - `ChatScreen`
  - `ChatInputDock`
  - `InputBar`
  - `VideoNoteRecorder`
- `ChatScreen` already provides `blurTargetRef`, and the recorder stage reuses the same blur target concept as the message context menu overlay.
- `VideoNoteBubble` now follows this behavior:
  - collapsed state is a circular in-chat note
  - tap expands it inline
  - `expo-video` playback runs inside the expanded circle
  - `playToEnd` triggers auto-collapse
- On Android, the circular video rendering path uses `surfaceType=\"textureView\"` and `useExoShutter={false}` to avoid square rendering artifacts during expansion.

## Group-Profile Implementation Notes
- `GroupProfileScreen` was decomposed into focused pieces under `mobile/src/components/group-profile/`.
- Current major extracted parts:
  - `GroupProfileHeaderSection`
  - `GroupProfileStickyTabs`
  - `GroupParticipantsSection`
  - `GroupProfileMediaContent`
  - `GroupProfileMediaViewerModal`
  - `GroupMemberTagModal`
  - `GroupAddMembersModal`
  - `groupProfile.constants.ts`
  - `groupProfile.utils.ts`
- This screen now acts mainly as an orchestration layer for:
  - data selection
  - navigation
  - server mutation handlers
  - popover/menu coordination

## Validation Notes
- `server` `npm run build` passes after the group-related backend changes.
- `mobile` `node --max-old-space-size=8192 .\\node_modules\\typescript\\bin\\tsc --noEmit` passes after the latest group-chat / video-note UI work.
- Local Prisma connectivity was revalidated against Docker Postgres after regenerating Prisma Client normally.

# Active Context

## Current Focus
- Telegram-like group chats are now part of the active product surface, not just planned scope.
- Group profile UX is now a first-class mobile area: participants, tags, media/files/voice tabs, and owner actions.
- Channel rollout is still planned around internal billing plus `Loginus account type` capability gating.
- The messenger continues to move toward a familiar Telegram-like UX across chat, profile, groups, and calls.
- Large mobile screens are being decomposed into orchestration screens plus focused child components to keep future polish safer.

## Recent Changes
- Added a real group-chat creation flow on mobile:
  - long-press on the `Chats` tab
  - quick action to create a group
  - dedicated create-group screen with member search and initial participant selection
- Added a Telegram-like group profile screen with:
  - avatar / title / member count hero
  - quick actions for mute / search / more
  - owner-only edit mode for photo / title / description
  - owner-only add-members flow
  - leave-group / delete-group actions
- Added participant long-press actions in groups:
  - write to participant
  - set/update member tag
  - remove participant (owner-only)
- Added server-backed group metadata:
  - chat `description`
  - member `tag`
  - member `tag_color`
- Group member tags now support four base colors and render as right-side badges similar to owner/admin pills.
- Group profile tabs now work as real interaction surfaces:
  - `Media` opens a fullscreen viewer and can jump back to the source message
  - `Files` can open directly or jump to the source message
  - `Voice` can play inline or jump to the source message
- Group profile now has compact sticky-header behavior on scroll, closer to Telegram.
- Anchored `More` popovers for peer/group profiles now open under the button instead of from the bottom of the screen.
- `GroupProfileScreen` was heavily decomposed into focused pieces:
  - `GroupProfileHeaderSection`
  - `GroupProfileStickyTabs`
  - `GroupParticipantsSection`
  - `GroupProfileMediaContent`
  - `GroupProfileMediaViewerModal`
  - `GroupMemberTagModal`
  - `GroupAddMembersModal`
  - `groupProfile.constants.ts`
  - `groupProfile.utils.ts`
- Local SQLite startup repair was strengthened so missing group-related columns can be added on-device even when old `user_version` state drifted.

## Current Constraints
- Group profile `Media / Files / Voice` tabs are derived from the locally loaded message set for that group; there is no dedicated deep-history media index API yet.
- Group-profile editing, descriptions, member tags, and tag colors require the updated backend and Prisma migrations on the target server.
- Group permissions are still simple:
  - owner-only edit/delete/add/remove flows
  - no full owner/admin/member permission matrix yet
- Channel/account-type capability implementation is still planning/design work, not shipped behavior.
- Some older files in the app still contain mojibake from earlier encoding damage; new work should stay UTF-8 clean.

## Next Likely Steps
1. Continue group-chat work:
   - richer roles/permissions
   - better deep-history behavior for group profile tabs
   - more Telegram-like group-management polish
2. Continue call work:
   - better call screen polish
   - clearer failed/busy/declined states
   - later video-call work after the current audio flow is more solid
3. Start the next familiar-UX features from the sprint:
   - circles / video notes polish
   - broader group-chat behavior
   - private-channel/account-type gating
4. Keep cleaning remaining monolithic mobile screens when there is real maintainability value, not just for cosmetic file splitting.
5. Clean remaining mojibake where it still leaks into user-facing strings.

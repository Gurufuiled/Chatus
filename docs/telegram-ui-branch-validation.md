# Telegram UI branch validation

This document records checks performed for the Telegram Android–oriented UI experiment (phases 2–7). Behavior and navigation should match the pre-experiment app; visual tokens and layout constants were updated without changing business logic.

## Scope

- **Theme:** `mobile/src/theme/colors.ts` (accent, toolbar, composer, incoming bubble border, `withAlpha` for accent overlays).
- **Presentation constants:** `mobile/src/presentation/` (`telegramChatUi.ts`, `index.ts`).
- **Screens/components:** chat list, chat thread, composer, bubbles, profiles, tabs.
- **Dependencies:** `@expo/vector-icons` is listed as a direct dependency in `mobile/package.json` so imports like `@expo/vector-icons/Feather` resolve for TypeScript and Metro (not only via `expo/node_modules/...`).

## Validation checklist

| Check | Command / action | Notes |
|--------|------------------|--------|
| Typecheck | `cd mobile && npx tsc --noEmit` | If Node runs out of heap, set `NODE_OPTIONS=--max-old-space-size=8192`. |
| Lint | Project default (if configured) | — |
| Smoke | `npx expo start` → open chat list, open a chat, send text, open overflow menu on a dialog row | Confirms imports resolve (`presentation`, `@expo/vector-icons`). |

## Files to keep tracked

- `mobile/src/presentation/` must be committed so CI and fresh clones resolve `../presentation` imports.

## Known follow-ups (non-blocking)

- Chat list context menu vertical position uses a fixed `topGap` heuristic; see comment on `computeChatListMenuPosition` in `telegramChatUi.ts`. Device-specific clipping may need `useSafeAreaInsets` later.
- Navigation strings in `ChatsStack` remain partly Russian (e.g. back title, presence); only the chat list title was aligned to English (`Chats`) where called out for product consistency.

## Revision

- **2026-04-11:** Initial doc for reviewer-requested branch validation record.

# Project Brief: P2P Messenger

## Core Goal
Build a mobile messenger that feels close to Telegram in daily use while still preserving the longer-term P2P / hybrid delivery direction.

## Current Real Scope
- private chats
- group chats
- text, photos, files, voice messages, video notes
- realtime messaging over WebSocket today
- local SQLite persistence and reconnect sync
- chat/profile/group UX polish
- in-app audio calls

## Planned Scope
- private channels
- account-type/capability gating driven by internal billing + `Loginus account type`
- circles / richer video communication
- video calls
- mini app / bot work

## Product Rule of Thumb
- First, make the messenger feel familiar and reliable.
- Then add gated/channel surfaces on top of that.
- Avoid introducing business-complex marketplace logic before the core messenger surfaces are strong.

## Implementation Reality
- `mobile/` is the main user-facing surface today.
- `server/` is still the active backend source of truth.
- P2P remains a longer-term architecture direction, not the current dominant runtime path.

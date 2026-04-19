# Project brief — Messenger (Telegram-like)

- **Product:** Mobile messenger (Expo React Native): чаты, группы, каналы (лента, обсуждения, реакции), авторизация через Loginus OAuth (`messenger://auth/callback`).
- **Delivery:** сообщения через **сервер** (HTTP + WebSocket); локальный SQLite для offline-first и очереди.
- **Calls:** WebRTC + signaling WebSocket на том же хосте, что API (отдельный порт).

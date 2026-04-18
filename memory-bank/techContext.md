# Tech context

- **Mobile:** Expo ~55, RN 0.83, TS, Zustand, Reanimated, React Navigation 7. Entry: `mobile/`.
- **Server:** NestJS, Prisma, REST + WebSocket — `server/`.
- **Config:** `mobile/src/config.ts` — `API_BASE_URL`, `CHANNEL_LINK_SCHEME`, `buildChannelSlugDeepLink` / `buildChannelInviteDeepLink`.
- **Rebuild:** After `app.json` scheme changes, native rebuild (prebuild / `expo run`) required for OS to register `chatus`.

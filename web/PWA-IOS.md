# ChatUs Standalone PWA (iPhone)

**Status:** Phase 2 implemented (Add to Home Screen polish)  
**URL:** `https://messenger.startapus.com/app/`  
**Embed (`/embed`) is unchanged** — Loginus iframe + `loginus:init` postMessage flow.

---

## What Phase 2 includes

- `manifest.webmanifest` at `/app/manifest.webmanifest` (`display: standalone`, theme `#3390ec`)
- App icons in `/app/icons/` (180×180 apple-touch-icon, 192/512 manifest icons, 32×32 favicon)
- iOS meta tags in `app.html`: `apple-mobile-web-app-title`, `theme-color`, `apple-touch-icon`
- **No service worker** yet — iOS Add to Home Screen works without it
- **No Web Push** yet (Phase 3+)
- **No WebRTC calls** in standalone yet

## Add to Home Screen (iPhone)

1. Open **Safari** → `https://messenger.startapus.com/app/`
2. Log in with Loginus if needed
3. Tap **Поделиться** (Share) at the bottom
4. Scroll and tap **На экран «Домой»** (Add to Home Screen)
5. Confirm name **ChatUs** → **Добавить**

The icon launches ChatUs full-screen without Safari chrome. Session is kept in `sessionStorage` (same as in-browser).

**Verify after deploy:**
- `https://messenger.startapus.com/app/manifest.webmanifest`
- `https://messenger.startapus.com/app/icons/apple-touch-icon.png`

---

## What Phase 1 includes

- Standalone SPA at `/app` with **mobile app UI** (mirrored from `mobile/`), not the embed web shell.
- Login screen styled like `mobile/src/screens/LoginScreen.tsx` (Chatus brand, Loginus button, privacy checkbox).
- Chat list and chat screen with Telegram-like mobile layout (single-column, not desktop split pane).
- OAuth login via Loginus in the **browser** (no `postMessage`).
- Session in `sessionStorage` (`chatus_web_session`), same refresh pattern as embed.
- Separate Vite build (`base: /app/`) → `server/public/app/`.
- Server static hosting at `/app` **without** `frame-ancestors` CSP (normal Safari page).
- OAuth callback: `GET /api/auth/callback` detects `state=web:*` and exchanges the code, then redirects to `/app/`.

**UI source:** `web/src/app-mobile/` — CSS/components mirroring `mobile/src/screens/` and `mobile/src/components/`. Reuses web auth (`publicAuth`), API client, WebSocket, and React Query only.

## Not in Phase 1 / 2

- Web Push notifications (service worker + server subscription endpoints)
- WebRTC group/1:1 calls in standalone context
- Changes to `/embed`

---

## Auth flow

```
User opens /app
  → MobileAuthGate restores session from sessionStorage (refresh token)
  → If no session: mobile login screen with privacy checkbox + "Войти с помощью Loginus"
  → GET /api/auth/login-url?platform=web
  → Redirect to id.startapus.com
  → Loginus redirects to /api/auth/callback?code=…&state=web:…
  → Callback HTML exchanges code via POST /api/auth/loginus
  → sessionStorage + redirect to /app/
  → Messenger UI loads, WebSocket connects
```

Mobile APK flow is unchanged: callback without `web:` state still uses `messenger://auth/callback`.

---

## Local development

### 1. API server

```bash
cd server
npm run start:dev
```

Ensure `.env` has `LOGINUS_CLIENT_ID`, `LOGINUS_CLIENT_SECRET`, and `LOGINUS_REDIRECT_URI=http://localhost:4000/api/auth/callback`.

For local web OAuth when the API and app run on different origins (e.g. Vite `:5174` vs API `:4000`), cookie-based state validation may fail. Opt in explicitly in `server/.env` (non-production only):

```env
CHATUS_OAUTH_DEV_SKIP_STATE=true
```

Use only for local development — never in production.

### 2. Standalone app (hot reload)

```bash
cd web
npm run dev:app
```

Open `http://localhost:5174/app/` — Vite proxies `/api` to `:4000`.

**Note:** Full OAuth round-trip (Loginus redirect back) requires the same host as `LOGINUS_REDIRECT_URI`. For local OAuth testing, use the production-like flow below (`localhost:4000/app`) rather than the Vite dev server.

### 3. Embed (unchanged)

```bash
cd web
npm run dev
```

Open `http://localhost:5173/embed/`.

### 4. Dev auth bypass (optional)

In `web/.env.local`:

```env
VITE_DEV_SKIP_EMBED_AUTH=true
VITE_DEV_ACCESS_TOKEN=<jwt from server>
```

Works for both embed and standalone dev servers.

### 5. Production-like local test

```bash
cd web
npm run build:app
cd ../server
npm run start:dev
```

Open `http://localhost:4000/app/`.

---

## Production

```bash
cd web
npm run build        # builds embed + app
# deploy server (includes server/public/app/)
```

- **App:** `https://messenger.startapus.com/app`
- **Callback:** `https://messenger.startapus.com/api/auth/callback` (already registered with Loginus)
- No extra redirect URI needed — `platform=web` is encoded in OAuth `state`.

After deploy, test on iPhone Safari:

1. Open `/app`
2. Tap “Войти через Loginus”
3. Complete Loginus login
4. Land on chat list

---

## Key files

| Area | Files |
|------|--------|
| App routes | `web/src/app/router-app.tsx`, `messengerRoutes.ts` |
| **Mobile UI (standalone)** | `web/src/app-mobile/` (`MobileAuthGate`, `MobileAppLayout`, screens, `mobile-app.css`) |
| OAuth client | `web/src/auth/publicAuth.ts`, `webSessionStorage.ts` |
| Embed auth gate (unchanged) | `web/src/features/shell/PublicAuthGate.tsx` |
| Build | `web/vite.app.config.ts`, `web/app.html`, `web/public-app/`, `npm run build:app` |
| Server static | `server/src/main.ts` (`/app` routes) |
| OAuth callback | `server/src/auth/auth.controller.ts` (`state` starts with `web:`) |

---

## Phase 3+ (next)

- Web Push (service worker + server subscription endpoints)
- WebRTC group/1:1 calls in standalone context
- Optional: dedicated logout UX for standalone (SLO via Loginus)
- Optional: iOS splash screens (`apple-touch-startup-image`)

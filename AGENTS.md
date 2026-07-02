# AGENTS.md

## Cursor Cloud specific instructions

Chatus is a P2P messenger (Telegram-style) monorepo with four sub-projects, each with its own
`package.json`/`Cargo.toml` (no root workspace):

| Dir | Stack | Role |
|-----|-------|------|
| `server/` | NestJS 11 + Prisma + Postgres | Backend API (`:4000/api`), chat WS (`:4001`), WebRTC signaling (`:4002`) |
| `web/` | React 18 + Vite 6 | Embedded web client served at `/embed` (`:5173` in dev) |
| `mobile/` | React Native 0.83 / Expo 55 | Primary client (Android/iOS) |
| `rust/` | Rust `image` crate | Optional `media-worker` (image/video metadata + thumbnails) |

Standard scripts live in each `package.json`; `server/README.md` and `server/.env.example` document
options. The notes below are only the non-obvious things for running/testing here.

### Postgres (required for the backend)
- Provided by an apt-installed cluster (`postgresql-16`), **not Docker** (Docker is unavailable in this VM).
- It is configured on **port 5433** to match `server/.env.example` defaults; DB `messenger`, role
  `messenger` / password `messenger_local_only_change_me`.
- The cluster is **not auto-started** on a fresh VM. Start it before running the backend or migrations:
  `sudo pg_ctlcluster 16 main start` (check with `sudo pg_lsclusters`).

### Backend (`server/`)
- Requires a `server/.env` file (gitignored, so it may be absent after a fresh checkout). Create it with
  `cp server/.env.example server/.env` and set a non-empty `JWT_SECRET` (the server exits immediately without it).
- Run migrations after Postgres is up: `cd server && npx prisma migrate deploy`.
- Dev run: `cd server && npm run start:dev` (listens on 4000/4001/4002). `npm run build` = `nest build`.
- **Test gotcha:** Prisma auto-loads `server/.env` into `process.env` during `npm test`. If
  `LOGINUS_EMBEDDED_APP_SLUG` is set (it is in `.env.example`), 3 `auth.service.spec.ts` tests fail with
  `Invalid initData appSlug`. Run unit tests with that var unset/commented in `.env` (CI has no `.env`, so it passes there).
- **Lint gotcha:** `npm run lint` currently reports pre-existing `@typescript-eslint/no-unsafe-*` errors
  in `src/users/dto/*` on a clean checkout — unrelated to environment setup.
- No hosted Loginus OAuth secret is available, so real login can't be exercised here. To test authenticated
  API routes locally, insert a `User` row and mint a JWT `{ sub: <user.id> }` signed with `JWT_SECRET`
  (HS256), then call the API with `Authorization: Bearer <token>`.

### Web (`web/`)
- Dev: `cd web && npm run dev` → `http://localhost:5173/embed/`. `npm run build` also copies output into
  `server/public/embed`. Tests: `npm test` (vitest).
- For a no-backend/no-auth UI demo, set `VITE_DEV_UI_PREVIEW=true` in `web/.env` (renders mock data).

### Mobile (`mobile/`)
- Install with `npm ci --legacy-peer-deps` (peer-dep conflicts otherwise); `postinstall` runs `patch-package`.
- Full Android/iOS emulator runs are not feasible in this VM. Use `npm run build` (`tsc --noEmit`) and
  `npm test` (custom `tsx` unit runner) to validate.

### Rust (`rust/`, optional)
- Disabled by default (`RUST_MEDIA_WORKER_ENABLED=false`); the server falls back to JS when off.
- Needs **Rust ≥ 1.85** (a transitive dep requires `edition2024`); the toolchain here is set to stable
  (1.96+) via `rustup default stable`. Build/test via `cd server && npm run rust:build` / `npm run rust:test`.

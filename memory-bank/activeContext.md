# Active context (2026-07-10)

- **Cloud deploy:** API prod via `./scripts/deploy-api-prod.sh` (SSH alias `chatus-cloud-deploy`, host `45.11.93.210`). Key lives in Cursor secret `DEPLOY_SSH_KEY` or gitignored `.secrets/deploy_ssh_key` — never in git. Setup: `./scripts/cloud-agent-ssh-setup.sh`. Docs: `server/DEPLOY_VPS.md`.
- **Preferred prod path:** merge to `main` → GitHub Actions `deploy-server.yml`.
- **Recent product/UI:** Telegram chat composer keyboard lift + inline reactions (PR branch `cursor/fix-telegram-chat-composer-reactions-c2b3`). Channel deep links use **chatus** scheme.
- **iOS device sideloading:** Free-team device install required local fixes in `mobile/ios`: `AppDelegate.swift` now falls back to embedded `main.jsbundle` in Debug when Metro is absent, and `.xcode.env.updates` unsets `SKIP_BUNDLING` for physical-device Debug builds so Xcode can embed JS for cable-installed builds.

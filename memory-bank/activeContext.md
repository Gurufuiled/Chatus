# Active context (2026-07-17)

- **Branch:** `dev-vlad`.
- **iOS TDLib auth safety:** Version 1.0.36 destroys each native TDLib client on RN bridge invalidation, excludes TDLib directories from backup best-effort, emits service/lifecycle diagnostics, and captures a bounded allowlisted production log tail on unexpected `LoggingOut`.
- **Recent product/UI:** Channel deep links use **chatus** scheme; leave-channel confirmation modal matches custom layout (title «Отписка от канала», red/blue pill buttons). Gallery sheet without dark overlay. Mute controls in channel profile header; subscriber mute styling aligned on chat/group profiles.
- **iOS device sideloading:** Free-team device install required local fixes in `mobile/ios`: `AppDelegate.swift` now falls back to embedded `main.jsbundle` in Debug when Metro is absent, and `.xcode.env.updates` unsets `SKIP_BUNDLING` for physical-device Debug builds so Xcode can embed JS for cable-installed builds.

# Progress

## Working / delivered (this line of work)

- Channels: feed, profile, settings, discussion, invite flows; server channel APIs and mocks where used.
- Client: `chatus://` link builders + linking; unsubscribe modal; attachment sheet transparency; profile mute UX tweaks.
- iOS physical-device app can now be installed for 7-day personal-team testing without Metro by embedding a JS bundle into Debug device builds and using the local TDLib iOS integration/signing workarounds.
- iOS TDLib bridge reloads no longer leave a hidden paused client alive; forced-logout diagnostics now include backup exclusion, service notifications, native instance identity, and a privacy-safe bounded production log tail.

## Follow-ups (optional)

- HTTPS public web links for channels (like t.me) if product needs browser fallback — not implemented; requires domain + hosting or universal links config.

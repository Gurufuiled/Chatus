# Product context

- UX aligned with Telegram Android patterns where practical (headers, profile quick actions, channel flows).
- **Channel links (app):** `chatus://c/{slug}` and `chatus://join/{token}` — shareable in-app; OAuth remains `messenger://`.
- **Deep linking:** React Navigation `linking.ts` prefixes include `chatus://` and `messenger://`; `app.json` scheme `["messenger", "chatus"]`.

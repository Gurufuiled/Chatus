# Product Context

## Emerging Product Direction (Apr 2026)
- Channels are still in the planning/design phase, but the preferred business direction changed.
- The first rollout should not depend on an internal creator-billing platform.
- The currently preferred model is:
  - account plans/tariffs unlock whether a user may create groups/channels
  - creator monetization happens via an external payment service
  - the app itself manages channel access, allowlists, removals, and moderation
- YooKassa is the current preferred external payment option for this path.
- This means the first implementation focus for channels is expected to be:
  - creation rights by account plan
  - public/private channel visibility
  - membership access control
  - admin/API tools for allowing or removing members

## Зачем существует проект
P2P Messenger — мессенджер с децентрализованной доставкой сообщений. В идеале сообщения идут напрямую между устройствами (P2P), а сервер используется как fallback и для офлайн-очереди.

## Проблемы, которые решает
1. **Приватность и контроль** — P2P снижает зависимость от централизованного сервера
2. **Офлайн-работа** — локальное хранение в SQLite, очередь при отсутствии сети
3. **Знакомый UX** — интерфейс в стиле Telegram для быстрого освоения

## Как должно работать
1. **Логин** — OAuth через Loginus (WebView → callback HTML → postMessage → обмен code на токены). В production на телефоне API и редиректы указывают на развёрнутый backend (HTTP(S) до VPS); `EXPO_PUBLIC_*` должны попадать в релизный бандл через **`expo.extra`** (`app.config.js`), иначе возможны сетевые ошибки на первом шаге входа.
2. **Чаты** — список чатов с превью последнего сообщения, имя собеседника (peer_display_name)
3. **Сообщения** — отправка текста, медиа; статусы (sending → sent → delivered → read)
4. **Транспорт** — P2P (если включён и peer онлайн), иначе WebSocket, иначе SyncQueue
5. **Офлайн** — сообщения пишутся в SyncQueue, при появлении сети SyncService обрабатывает очередь

## Модель хранения (`docs/hranenie.md`, локально)
- Файл может отсутствовать в корпоративном клоне (папка `docs/` в `.gitignore`); для P2P-планирования держи копию у себя или восстанавливай из бэкапа.
- **Отправка:** A сохраняет в свой SQLite → если B онлайн: P2P или сервер → B сохраняет в свой SQLite
- **B офлайн:** сообщение в очереди на сервере
- **B появляется:** сервер отдаёт очередь → B сохраняет в SQLite
- **Несколько устройств:** текущая модель — один активный аккаунт = одно устройство (сервер отдаёт и удаляет из очереди; планшет, будучи офлайн, сообщение не получит)

## Пользовательский опыт
- Экран логина (WebView Loginus)
- Вкладки: Чаты, Контакты, Настройки
- Экран чата: баблы сообщений, InputBar, голосовые, видео-кружки
- Logout с SLO (Single Logout) через WebView при наличии id_token

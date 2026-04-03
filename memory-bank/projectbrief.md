# Project Brief: P2P Messenger

## Emerging Scope Extension (Apr 2026)
- Planned channel work is now framed around access control first, not internal billing first.
- The current preferred shape is:
  - account plans determine who may create channels/groups
  - creator-side monetization may happen through an external payment provider
  - the messenger enforces who can stay inside a private/paid community
- This keeps the near-term scope aligned with the product goal of a strong Telegram-like messenger while avoiding premature in-app payout complexity.

## Название и суть
**P2P Messenger** — мобильный мессенджер (клон Telegram) с P2P-доставкой сообщений через WebRTC.

## Цели проекта
1. Создать мессенджер, максимально близкий к Telegram по функционалу и UX
2. Реализовать доставку сообщений, голосовых и медиа через P2P (WebRTC DataChannel)
3. При невозможности P2P — fallback на сервер через WebSocket
4. Offline-first: все данные хранятся локально в SQLite

## Ключевые требования
- **Транспорт (приоритет):**
  1. P2P (WebRTC DataChannel) — если оба пользователя онлайн и P2P установлен
  2. WebSocket (сервер relay) — если P2P недоступен
  3. Offline queue (SyncQueue в SQLite) — если нет сети

- **Типы сообщений:** text, image, voice, video_note, video, file, system

- **Аутентификация:** OAuth через Loginus (loginus.startapus.com)

- **Хранение:** Локально SQLite на устройстве; сервер — PostgreSQL (Prisma)

## Целевая архитектура (по правилам)
- **Rust Core** — планируется: ядро, БД, P2P, синхронизация, uniffi мост
- **React Native (Expo)** — UI, запись медиа, анимации

## Текущая реализация (фактическая)
- **mobile/** — React Native (Expo), Zustand, expo-sqlite
- **server/** — NestJS, PostgreSQL (Prisma), WebSocket, Signaling
- **Rust Core** — пока не реализован (messengerBridge — placeholder)

## Репозиторий и выкладка
- Корпоративный Git: **Startupus-Team/chatus** (`main`, private) — основной источник для команды.
- Личный remote (у автора): **Gurufuiled/Chatus** — дублирование/черновики; видимость настраивается в GitHub (можно private).
- Корневые **`docs/`** и **`steps/`** не отслеживаются Git’ом (`.gitignore`); заметки и планы остаются только локально у разработчика.
- Бэкенд: Docker Compose на VPS; мобильные релизы: Android (`assembleRelease`), iOS — **Xcode** (в репо есть **`mobile/ios/`**, CocoaPods) или **EAS Build**; тестерам iOS удобнее **TestFlight** (Apple Developer Program, ~$99/год).

## Scope
- Приватные и групповые чаты
- Текстовые сообщения, голосовые, видео-кружки, фото, файлы
- OAuth (Loginus), JWT, refresh tokens
- WebSocket realtime, typing, presence
- Offline queue и синхронизация при восстановлении сети

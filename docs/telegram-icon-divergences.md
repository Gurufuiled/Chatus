# Known divergences: Telegram icons → React Native

## Тинты и цвета

- В Android ресурсах часто указан `fillColor="#FFFFFF"` и итоговый цвет задаётся **tint** на `ImageView` / табе.
- В RN мы передаём `color` из `tabBarActiveTintColor` / `tabBarInactiveTintColor` и темы (`colors.accent`, `colors.textPrimary`).

## Состояния таба «Настройки»

- Использована пара `outline_profile_settings` / `filled_profile_settings`, а не отдельный `tabs_settings_*` (в проиндексированных drawable такого префикса нет).

## Иконка `more` в профиле

- **Адаптация:** три заполненных круга во `viewBox 0 0 72 72` (`cx` 18 / 36 / 54, `r ≈ 4.5`), визуально близко к стандартному horizontal overflow, без копирования конкретного telegram-файла (в выборке не найден подходящий `*_more*.xml`).

## Шеврон disclosure в настройках

- **Адаптация:** символ `›` / стиль текста, без отдельного vector из репозитория.

## `settings_delete.xml` для выхода

- Не используется: иконка корзины семантически не совпадает с «Выйти». Вместо этого — `settings_power.xml` (72×72), ближе к «устройство / сессия».

## Сборка и viewport

- Большинство иконок: `viewBox="0 0 72 72"`.
- Если позже добавятся drawable с другим `viewportWidth` (например 24), для них нужен отдельный `viewBox` в `TelegramGlyph`.

## Валидация

- После изменений: `cd mobile && npx tsc --noEmit` (при необходимости `NODE_OPTIONS=--max-old-space-size=8192`).
- Ручная проверка: активный/неактивный таб, long-press на «Чаты», профильные кнопки, список настроек и поиск на контактах.

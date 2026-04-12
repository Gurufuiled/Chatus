# Telegram Android icon source map

Литеральный перенос векторных `pathData` из репозитория **DrKLO/Telegram** (`TMessagesProj/src/main/res/drawable/*.xml`) в React Native (`react-native-svg`), плюс явные отклонения — см. [telegram-icon-divergences.md](./telegram-icon-divergences.md).

Локальный эталон для аудита (не коммитится в продуктовый код): `Improvements/telegram-android-ref/` (sparse checkout `res`).

## Нижние табы (`MainTabs`)

| Наш UI | Telegram drawable (inactive) | Telegram drawable (active) | Примечание |
|--------|------------------------------|----------------------------|------------|
| Контакты | `tabs_contacts_24.xml` | `tabs_contact_active_24.xml` | В upstream имя active-ресурса с опечаткой: `contact` без `s`. |
| Чаты | `tabs_chats_24.xml` | `tabs_chats_active_24.xml` | |
| Настройки | `outline_profile_settings.xml` | `filled_profile_settings.xml` | Отдельного `tabs_settings_*` в выборке drawable не найдено; иконка совпадает с профильными «шестерёнками» Telegram. |

## Long-press «Создать групповой чат» (`MainTabs` quick menu)

| Наш UI | Telegram drawable | Примечание |
|--------|-------------------|------------|
| Иконка группы + плюс | `outline_profile_member_24.xml` | Литеральный path. |

## Профиль — quick actions (`ProfileActionIcon`)

| Имя в приложении | Telegram drawable(s) | Состояния |
|------------------|----------------------|-----------|
| `call` | `outline_profile_call_24.xml` / `filled_profile_call_24.xml` | outline = обычное; filled = «активное» (как в Material/Telegram filled set). |
| `sound` | `outline_profile_mute_24.xml` / `outline_profile_unmute_24.xml` | В нашем UI `active === true` означает «звук выкл./заглушено» → показываем `outline_profile_unmute` (колокол со слешем). |
| `search` | `outline_search_1_24.xml` | |
| `more` | — | В доступном наборе не найден отдельный drawable «три точки» для профиля; см. divergences. |

## Экран настроек — строки меню (`SettingsScreen`)

Иконки секций (литеральные path из `settings_*.xml`):

| Строка (RU) | Drawable |
|-------------|----------|
| Мой аккаунт | `settings_account.xml` |
| Уведомления и звуки | `settings_sounds.xml` |
| Конфиденциальность | `settings_privacy.xml` |
| Данные и память | `settings_data.xml` |
| Настройки чатов | `settings_chat.xml` |
| Язык | `settings_language.xml` |
| Устройства | `settings_devices.xml` |
| Пароль и безопасность | `settings_security.xml` |
| Выход из аккаунта | `settings_power.xml` |

Строки без бэкенда помечены в UI как **«Скоро»** (placeholder).

## Контакты (`ContactsScreen`)

| Место | Drawable |
|-------|----------|
| Поле поиска, leading icon | `outline_search_1_24.xml` |

## Провенанс и лицензия

Исходные векторы — часть **Telegram for Android** (GPL). Храним только геометрию path в TypeScript для визуального сходства; при публичном релизе проверьте совместимость лицензий и товарные знаки.

## Регенерация path-файлов

При обновлении эталона `Improvements/telegram-android-ref` (каталог в `.gitignore`):

1. `node scripts/extract-telegram-tab-paths.mjs` → `mobile/src/icons/telegram/tabPaths.ts`
2. `node scripts/extract-telegram-profile-settings-paths.mjs` → `profilePaths.ts`, `settingsPaths.ts`

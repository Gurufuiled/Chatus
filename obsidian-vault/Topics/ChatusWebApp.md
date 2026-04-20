# ChatusWebApp — спецификация моста Mini App (v1)

> Контракт между HTML-страницей мини-приложения и нативным клиентом Chatus.
> Совместимость с `Telegram.WebApp` **не** заявлена: это собственный API.

## Как запускается

1. Разработчик регистрирует приложение у системного бота **@ChatusFather** и получает `app_id` + `app_secret` + URL.
2. Пользователь открывает Mini App через **Настройки → Сервисы** (или ссылку).
3. Клиент запрашивает у сервера `POST /mini-apps/:app_id/session` и получает:
   ```json
   {
     "init_data": "<base64url(payload)>.<hex(HMAC-SHA256)>",
     "expires_at": 1734567890
   }
   ```
4. WebView грузит `base_url` приложения. До загрузки контента (`injectedJavaScriptBeforeContentLoaded`) внедряется глобальный объект `window.ChatusWebApp`.

## window.ChatusWebApp

```typescript
interface ChatusWebApp {
  readonly version: string;          // "1.0"
  readonly platform: 'android' | 'ios' | 'web';
  readonly initData: string;         // передать на свой backend для проверки
  readonly initDataUnsafe: {         // только для UI, НЕ доверять на backend
    user: { id: string; display_name?: string; username?: string; avatar_url?: string };
    auth_date: number;               // unix seconds
    app_id: string;
  };
  readonly themeParams: {
    bg_color: string;
    text_color: string;
    hint_color: string;
    link_color: string;
    button_color: string;
    button_text_color: string;
    secondary_bg_color: string;
  };
  readonly colorScheme: 'light' | 'dark';
  readonly viewportHeight: number;

  ready(): void;                     // сообщить нативу, что UI готов (скрыть skeleton)
  close(): void;                     // закрыть Mini App
  sendData(data: string): void;      // отправить строку обратно в Chatus (payload сообщения или хук)
  openLink(url: string): void;       // открыть HTTPS во встроенном браузере поверх Chatus
  onEvent(event: 'themeChanged' | 'viewportChanged', cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
}
```

### Методы

| Метод           | Описание                                                                           |
| --------------- | ---------------------------------------------------------------------------------- |
| `ready()`       | Клиент скрывает индикатор загрузки. Желательно вызвать после DOMContentLoaded.     |
| `close()`       | Закрыть экран мини-приложения.                                                     |
| `sendData(str)` | Отправить произвольную строку обратно в нативный слой. Доставка ключом `send_data` в `POST /mini-apps/:app_id/data` с `init_data`. |
| `openLink(url)` | Только `https://`. Открывается во встроенном браузере (Custom Tabs / Safari VC).   |

## Init payload и подпись

### Формат `init_data`

Строка вида `<payload_b64url>.<hex_signature>` где:

- `payload_b64url` — `base64url(JSON.stringify(payload))`
- `hex_signature` — `HMAC-SHA256(app_secret, payload_b64url)` в hex

### Поля payload

```json
{
  "app_id": "app_xxx",
  "user": {
    "id": "uuid",
    "display_name": "Artem",
    "username": "artem",
    "avatar_url": "https://..."
  },
  "auth_date": 1734567890,
  "nonce": "random-hex",
  "exp": 1734571490
}
```

### Проверка подписи (backend разработчика)

```js
const [b64, sig] = initData.split('.');
const expected = crypto
  .createHmac('sha256', APP_SECRET)
  .update(b64)
  .digest('hex');
if (expected !== sig) throw new Error('bad signature');
const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
if (payload.exp < Date.now() / 1000) throw new Error('expired');
```

### Обмен на короткую сессию (рекомендуется)

`POST /mini-apps/:app_id/session/exchange` с `{ init_data }` → `{ session_token, expires_at }`.
Далее все запросы с `Authorization: Bearer <session_token>` (TTL ~15 мин).

## postMessage (WebView → RN)

Страница общается с нативом через `window.ReactNativeWebView.postMessage(JSON.stringify(msg))`. Методы `ChatusWebApp` используют это автоматически. Формат:

```json
{ "type": "ready" }
{ "type": "close" }
{ "type": "sendData", "data": "..." }
{ "type": "openLink", "url": "https://..." }
```

## Ограничения v1

- Только **HTTPS** URL; домен **base_url** должен совпадать с зарегистрированным в ChatusFather.
- Жёстких лимитов `sendData` в v1 нет (планируется ввести в v2).
- Платежи, шифрование, BiometricAuth, QR, геолокация, буфер обмена — **вне v1**.
- `initDataUnsafe` — для UI без доверия; backend обязан проверять подпись `initData`.

## spec_version

Текущая — `1.0`. При изменении несовместимых полей поднимается major. Поле `version` возвращается через `window.ChatusWebApp.version`.

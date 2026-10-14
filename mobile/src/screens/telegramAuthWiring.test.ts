/**
 * Контрактный тест экрана входа в Telegram: он обязан восстанавливать закрытый клиент TDLib до любых запросов
 * входа и не зависать на недоступных серверах. Экран слишком тяжёлый для юнит-рендера, поэтому проверяем исходники.
 *
 * Что было: после выхода из аккаунта (или когда TDLib застревал в LoggingOut из-за недоступных серверов Telegram)
 * экран писал «Не удалось начать вход (состояние: authorizationStateLoggingOut). Закройте экран и откройте
 * снова», и войти было нельзя даже после перезапуска приложения.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'TelegramAuthScreen.tsx'), 'utf8');

/** Тело функции/колбэка, начиная с маркера, до закрывающей скобки того же уровня. */
function bodyFrom(marker: string): string {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `не найден фрагмент: ${marker}`);
  const open = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`не найден конец: ${marker}`);
}

function indexOfIn(body: string, needle: string, label: string): number {
  const index = body.indexOf(needle);
  assert.ok(index >= 0, `${label}: нет ${needle}`);
  return index;
}

// ── восстановление клиента идёт раньше передачи параметров во всех трёх входах ──
for (const [label, marker] of [
  ['синхронизация при открытии', 'const syncAuthorizationFromTdlib ='],
  ['вход по номеру', 'const submitPhone = useCallback('],
  ['вход по QR', 'const startQrLogin = useCallback('],
] as const) {
  const body = bodyFrom(marker);
  const recover = indexOfIn(body, 'recoverTdlibAuthSession()', label);
  const apply = indexOfIn(body, 'applyTdlibParameters()', label);
  assert.ok(recover < apply, `${label}: восстановление клиента должно идти до applyTdlibParameters`);
}

// ── бесполезный совет «закройте экран» убран, вместо него разбор состояния ──
assert.doesNotMatch(source, /Закройте экран и откройте снова\.`/, 'старое сообщение вернулось');
assert.match(source, /describeUnexpectedAuthState\(probeType\)/);

// ── недоступные серверы Telegram: не ждём 10 минут, а сразу говорим ──
{
  const body = bodyFrom('const submitPhone = useCallback(');
  const catchStart = indexOfIn(body, 'testNetwork FAILED', 'submitPhone');
  const afterCatch = body.slice(catchStart, catchStart + 900);
  assert.match(afterCatch, /throw new Error\(/, 'при провале testNetwork вход должен прерываться');
  assert.match(afterCatch, /VPN/, 'подсказка про VPN');
}

// ── код: незарегистрированный номер и вход по e-mail не должны давать 90 секунд ожидания ──
{
  const body = bodyFrom('const submitCode = useCallback(');
  for (const state of [
    'authorizationStateWaitRegistration',
    'authorizationStateWaitEmailAddress',
    'authorizationStateWaitEmailCode',
  ]) {
    assert.ok(body.includes(`"${state}"`), `submitCode: не ждёт ${state}`);
  }
  assert.match(body, /describeUnexpectedAuthState\(nextState\)/);
  assert.match(body, /formatTdlibAuthError\(message\)/, 'ошибки кода показываются человеческим текстом');
}

// ── выход с шага кода/пароля без сброса сессии ──
assert.match(source, /testID="telegram-auth-change-phone"/);
assert.ok(
  (source.match(/Изменить номер телефона/g) ?? []).length >= 2,
  'ссылка «Изменить номер» нужна и на шаге кода, и на шаге пароля',
);
assert.match(source, /changingPhoneRef\.current = true/);

// ── номер отправлен: состояние берётся из ответа TDLib, а не всегда «ждём код» ──
assert.match(source, /resolvedState === "authorizationStateReady"/);
assert.match(source, /authorizationStateWaitOtherDeviceConfirmation"\s*\?\s*"waiting_qr"/);

console.log('telegramAuthWiring.test.ts: ok');

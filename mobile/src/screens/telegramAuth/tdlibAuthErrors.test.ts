import assert from 'node:assert/strict';
import {
  describeUnexpectedAuthState,
  formatTdlibAuthError,
  formatWaitDuration,
  parseFloodWaitSeconds,
} from './tdlibAuthErrors';

// ── прежние сообщения не изменились ──
assert.match(formatTdlibAuthError('PASSWORD_HASH_INVALID'), /Неверный облачный пароль/);
assert.match(formatTdlibAuthError('password_required'), /двухэтапная проверка/);
assert.equal(formatTdlibAuthError('что-то своё'), 'что-то своё', 'незнакомая ошибка показывается как есть');

// ── ошибки ввода номера и кода ──
assert.match(formatTdlibAuthError('PHONE_NUMBER_INVALID'), /Номер телефона указан неверно/);
assert.match(formatTdlibAuthError('PHONE_NUMBER_BANNED'), /заблокирован/);
assert.match(formatTdlibAuthError('PHONE_CODE_INVALID'), /Неверный код/);
assert.match(formatTdlibAuthError('PHONE_CODE_EMPTY'), /Неверный код/);
assert.match(formatTdlibAuthError('PHONE_CODE_EXPIRED'), /Код устарел/);
assert.match(formatTdlibAuthError('phone_code_invalid'), /Неверный код/, 'регистр не важен');

// ── ограничение по частоте ──
assert.match(formatTdlibAuthError('FLOOD_WAIT_300'), /через 5 мин/);
assert.match(formatTdlibAuthError('Too Many Requests: retry after 3600'), /через 1 ч/);
assert.match(formatTdlibAuthError('PHONE_NUMBER_FLOOD'), /Повторите позже/);
assert.match(formatTdlibAuthError('FLOOD_WAIT_30'), /через 30 с/);

assert.equal(parseFloodWaitSeconds('FLOOD_WAIT_300'), 300);
assert.equal(parseFloodWaitSeconds('TOO MANY REQUESTS: RETRY AFTER 42'), 42);
assert.equal(parseFloodWaitSeconds('PHONE_NUMBER_INVALID'), null);
assert.equal(parseFloodWaitSeconds(''), null);

assert.equal(formatWaitDuration(1), '1 с');
assert.equal(formatWaitDuration(0), '1 с', 'ноль секунд не показываем');
assert.equal(formatWaitDuration(59), '59 с');
assert.equal(formatWaitDuration(60), '1 мин');
assert.equal(formatWaitDuration(61), '2 мин', 'округляем вверх');
assert.equal(formatWaitDuration(3600), '1 ч');
assert.equal(formatWaitDuration(3660), '1 ч 1 мин');
assert.equal(formatWaitDuration(7500), '2 ч 5 мин');

// ── состояния TDLib, из-за которых вход не начинается ──
for (const dead of ['authorizationStateLoggingOut', 'authorizationStateClosing', 'authorizationStateClosed']) {
  const text = describeUnexpectedAuthState(dead);
  assert.match(text, /завершает выход/, dead);
  assert.match(text, /VPN/, 'подсказка про недоступность Telegram');
  assert.doesNotMatch(text, /Закройте экран/, 'прежний бесполезный совет убран');
}
assert.match(describeUnexpectedAuthState('authorizationStateWaitRegistration'), /не зарегистрирован/);
assert.match(describeUnexpectedAuthState('authorizationStateWaitEmailAddress'), /e-mail/);
assert.match(describeUnexpectedAuthState('authorizationStateWaitEmailCode'), /e-mail/);
assert.match(describeUnexpectedAuthState('authorizationStateSomethingNew'), /состояние: authorizationStateSomethingNew/);
assert.match(describeUnexpectedAuthState(undefined), /состояние: \?/);

console.log('tdlibAuthErrors.test.ts: ok');

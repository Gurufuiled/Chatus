import assert from 'node:assert/strict';
import {
  SERVER_UNREACHABLE_PREFIX,
  friendlyApiError,
  isNetworkErrorMessage,
  serverTimeoutMessage,
} from './apiErrorMessage';

// ── сообщение таймаута ──
assert.match(serverTimeoutMessage('https://api.example/api', true), /телефон и ПК в одной сети.*https:\/\/api\.example\/api/);
{
  const prod = serverTimeoutMessage('https://api.example/api', false);
  assert.ok(prod.startsWith(SERVER_UNREACHABLE_PREFIX));
  assert.doesNotMatch(prod, /ПК/, 'в релизе нет подсказки для разработчика');
  assert.doesNotMatch(prod, /api\.example/, 'и адреса сервера');
}

// ── сетевые ошибки превращаются в понятный текст с подсказкой про VPN ──
for (const raw of [
  serverTimeoutMessage('https://x', true),
  serverTimeoutMessage('https://x', false),
  'Network request failed',
  'TypeError: Failed to fetch',
  'Request timed out',
  'Aborted',
  'getaddrinfo ENOTFOUND messenger.startapus.com',
]) {
  assert.equal(isNetworkErrorMessage(raw), true, raw);
  const text = friendlyApiError(new Error(raw));
  assert.match(text, /Нет связи с сервером Chatus/, raw);
  assert.match(text, /VPN/, raw);
}

// ── остальные ошибки показываются как есть ──
assert.equal(friendlyApiError(new Error('Неверный пароль')), 'Неверный пароль');
assert.equal(isNetworkErrorMessage('Неверный пароль'), false);
assert.equal(friendlyApiError('строка'), 'строка');

// ── пустое — запасной текст ──
assert.equal(friendlyApiError(new Error('')), 'Не удалось выполнить запрос');
assert.equal(friendlyApiError(undefined), 'Не удалось выполнить запрос');
assert.equal(friendlyApiError(null, 'Своё'), 'Своё');
assert.equal(friendlyApiError({}), 'Не удалось выполнить запрос');

console.log('apiErrorMessage.test.ts: ok');

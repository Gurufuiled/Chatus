import assert from 'node:assert/strict';
import { classifyTelegramForwardOriginType } from './telegramForwardOrigin';

assert.equal(classifyTelegramForwardOriginType('messageOriginUser'), 'user');
assert.equal(classifyTelegramForwardOriginType('messageOriginChat'), 'chat');
assert.equal(classifyTelegramForwardOriginType('messageOriginChannel'), 'channel');
assert.equal(classifyTelegramForwardOriginType('messageOriginHiddenUser'), 'hidden_user');
assert.equal(classifyTelegramForwardOriginType('messageForwardOriginChannel'), 'channel');
assert.equal(classifyTelegramForwardOriginType('unknown'), 'unknown');

console.log('telegramForwardOrigin TDLib compatibility tests: OK');

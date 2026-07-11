import assert from 'node:assert/strict';

/**
 * Mirrors telegramAccountStore persist payload shape — dialogs must never be
 * written to SecureStore (iOS Keychain size limits cause silent persist failures).
 */
function buildPersistPayload(input: {
  authStatus: string;
  telegramUserId: number | null;
  phoneNumberHint: string | null;
  dialogs: unknown[];
}) {
  const authStatus = input.authStatus === 'error' ? 'ready' : input.authStatus;
  return {
    authStatus,
    telegramUserId: input.telegramUserId,
    phoneNumberHint: input.phoneNumberHint,
  };
}

const payload = buildPersistPayload({
  authStatus: 'ready',
  telegramUserId: 42,
  phoneNumberHint: '+7999',
  dialogs: Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    title: `Chat ${i}`,
    lastMessagePreview: 'x'.repeat(200),
    chatId: String(i),
  })),
});

assert.equal(payload.authStatus, 'ready');
assert.equal(payload.telegramUserId, 42);
assert.equal(payload.phoneNumberHint, '+7999');
assert.equal('dialogs' in payload, false);

const json = JSON.stringify(payload);
assert.ok(json.length < 500, `persist payload too large: ${json.length}`);

const errorMapped = buildPersistPayload({
  authStatus: 'error',
  telegramUserId: 1,
  phoneNumberHint: null,
  dialogs: [],
});
assert.equal(errorMapped.authStatus, 'ready');

console.log('telegramAccountPersist.test.ts OK');

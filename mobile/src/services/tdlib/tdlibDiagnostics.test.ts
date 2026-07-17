import assert from 'node:assert/strict';
import {
  createTdlibServiceNotificationDeduper,
  filterTdlibLogDiagnostics,
  getLastTdlibAuthKeyDrop,
  getTdlibServiceNotificationUiDecision,
  markTdlibAuthKeyDrop,
  parseTdlibServiceNotification,
} from './tdlibDiagnostics';

const duplicate = parseTdlibServiceNotification({
  '@type': 'updateServiceNotification',
  type: 'AUTH_KEY_DROP_DUPLICATE',
  content: {
    '@type': 'messageText',
    text: {
      '@type': 'formattedText',
      text: 'Key dropped for +1 (555) 123-4567, code 12345, api_hash=abcdef1234567890',
      entities: [],
    },
  },
});
assert.ok(duplicate);
assert.equal(duplicate.notificationType, 'AUTH_KEY_DROP_DUPLICATE');
assert.equal(duplicate.remoteNotificationType, 'AUTH_KEY_DROP_DUPLICATE');
assert.equal(duplicate.isAuthKeyDrop, true);
assert.equal(duplicate.text.includes('555'), false);
assert.equal(duplicate.text.includes('12345'), false);
assert.equal(duplicate.text.includes('abcdef1234567890'), false);

markTdlibAuthKeyDrop(duplicate, 123);
assert.deepEqual(getLastTdlibAuthKeyDrop(), {
  notificationType: 'AUTH_KEY_DROP_DUPLICATE',
  observedAt: 123,
});
assert.deepEqual(getTdlibServiceNotificationUiDecision(duplicate), {
  kind: 'auth_key_drop',
  title: 'Сессия Telegram завершена',
  message: duplicate.text,
});

const ordinaryNotice = parseTdlibServiceNotification({
  '@type': 'updateServiceNotification',
  type: 'OTHER',
  content: {
    '@type': 'messageText',
    text: { '@type': 'formattedText', text: 'Server maintenance', entities: [] },
  },
});
assert.ok(ordinaryNotice);
assert.deepEqual(getTdlibServiceNotificationUiDecision(ordinaryNotice), {
  kind: 'notice',
  title: 'Telegram',
  message: 'Server maintenance',
});

const emptyNotice = parseTdlibServiceNotification({
  '@type': 'updateServiceNotification',
  type: 'OTHER',
  content: { '@type': 'messageText', text: { '@type': 'formattedText', entities: [] } },
});
assert.ok(emptyNotice);
assert.deepEqual(getTdlibServiceNotificationUiDecision(emptyNotice), { kind: 'none' });

const legacyFlatNotice = parseTdlibServiceNotification({
  '@type': 'updateServiceNotification',
  type: 'OTHER',
  content: { text: 'Legacy flat text' },
});
assert.equal(legacyFlatNotice?.text, 'Legacy flat text');

const deduper = createTdlibServiceNotificationDeduper();
deduper.observeAuthState('authorizationStateReady');
assert.equal(deduper.shouldDisplay(ordinaryNotice), true);
assert.equal(deduper.shouldDisplay(ordinaryNotice), false);
deduper.observeAuthState('authorizationStateLoggingOut');
deduper.observeAuthState('authorizationStateClosing');
deduper.observeAuthState('authorizationStateClosed');
assert.equal(
  deduper.shouldDisplay(ordinaryNotice),
  false,
  'forced-logout transitions and Cancel must preserve the incident fingerprint',
);
deduper.observeAuthState('authorizationStateWaitPhoneNumber');
assert.equal(deduper.shouldDisplay(ordinaryNotice), false);
deduper.observeAuthState('authorizationStateReady');
assert.equal(
  deduper.shouldDisplay(ordinaryNotice),
  true,
  'a completed fresh login cycle may display the notification again',
);
deduper.reset();
assert.equal(deduper.shouldDisplay(ordinaryNotice), true);

assert.equal(
  parseTdlibServiceNotification({ '@type': 'updateAuthorizationState' }),
  null,
);

const lines = filterTdlibLogDiagnostics(
  [
    'ordinary transport trace with message body',
    '[auth] Receive error 401 AUTH_KEY_DUPLICATED phone_number=+15551234567',
    'open database /private/var/mobile/Containers/Data/Application/SECRET/tdlib/db.sqlite',
    'session error 406 api_hash=abcdef1234567890 token=abcdefghijklmnopqrstuvwxyz123456 "text":"private body"',
  ].join('\n'),
);
assert.equal(lines.length, 2);
assert.match(lines[0]!, /codes=401/);
assert.match(lines[0]!, /tokens=AUTH_KEY_DUPLICATED/);
assert.equal(lines.join('\n').includes('15551234567'), false);
assert.equal(lines.join('\n').includes('abcdef1234567890'), false);
assert.equal(lines.join('\n').includes('abcdefghijklmnopqrstuvwxyz123456'), false);
assert.equal(lines.join('\n').includes('private body'), false);
assert.equal(lines.join('\n').includes('/private/var/'), false);

const adversarial = filterTdlibLogDiagnostics(
  'auth error for user Artem @private_user from 192.0.2.123 in Paris',
);
assert.deepEqual(adversarial, ['flags=auth,error']);
assert.deepEqual(
  filterTdlibLogDiagnostics('auth error AUTH_KEY_15551234567 for Artem'),
  ['flags=auth,error'],
);

const unknownDrop = parseTdlibServiceNotification({
  '@type': 'updateServiceNotification',
  type: 'AUTH_KEY_DROP_15551234567',
  content: { text: 'Artem @private_user' },
});
assert.equal(unknownDrop?.remoteNotificationType, 'AUTH_KEY_DROP_OTHER');

const manyLines = Array.from(
  { length: 30 },
  (_, index) => `auth error 401 AUTH_KEY_${index} ${'x'.repeat(500)}`,
).join('\n');
const bounded = filterTdlibLogDiagnostics(manyLines);
assert.ok(bounded.length <= 12);
assert.ok(bounded.join('').length <= 2800);

console.log('tdlibDiagnostics.test.ts OK');

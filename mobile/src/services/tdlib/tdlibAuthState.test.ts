import assert from 'node:assert/strict';
import { mapTdlibAuthStateToStore } from './tdlibAuthStateMapping';

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateClosed', 'ready'),
  'ready',
  'closed must not downgrade ready session to error',
);

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateClosing', 'ready'),
  'ready',
  'closing keeps ready',
);

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateWaitPhoneNumber', 'ready'),
  'ready',
  'WaitPhone must not downgrade a Ready session — only Settings logout clears it',
);

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateClosed', 'idle'),
  'error',
  'idle + closed → error',
);

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateReady', 'idle'),
  'ready',
  'idle + ready restores session',
);

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateWaitTdlibParameters', 'ready'),
  'ready',
  'wait parameters keeps ready',
);

console.log('tdlibAuthState.test.ts OK');

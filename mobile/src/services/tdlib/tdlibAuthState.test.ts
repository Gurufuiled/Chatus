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
  'waiting_phone',
  'explicit re-auth still applies',
);

assert.equal(
  mapTdlibAuthStateToStore('authorizationStateClosed', 'idle'),
  'error',
  'idle + closed → error',
);

console.log('tdlibAuthState.test.ts OK');

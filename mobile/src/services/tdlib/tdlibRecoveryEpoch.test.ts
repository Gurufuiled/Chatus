import assert from 'node:assert/strict';
import { createTdlibRecoveryEpoch } from './tdlibRecoveryEpoch';

const epoch = createTdlibRecoveryEpoch();
const first = epoch.capture();
assert.equal(epoch.isCurrent(first), true);
assert.equal(epoch.cancel(), 1);
assert.equal(epoch.isCurrent(first), false);

const second = epoch.capture();
assert.equal(epoch.isCurrent(second), true);
epoch.cancel();
epoch.cancel();
assert.equal(epoch.isCurrent(second), false);
assert.equal(epoch.isCurrent(epoch.capture()), true);

console.log('tdlibRecoveryEpoch.test.ts OK');

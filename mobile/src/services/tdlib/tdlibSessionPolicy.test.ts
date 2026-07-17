import assert from 'node:assert/strict';
import {
  isClosedOrClosingAuthState,
  isClosingAuthState,
  isTrulyClosedAuthState,
  isValidTelegramUserId,
  shouldAllowHardRecreateOnClosed,
  shouldBootstrapPhoneLoginFromLocalStatus,
  shouldForceApplyParametersInSoftOrWaitLoop,
  shouldForceApplyParametersOnWaitTdlibParameters,
} from './tdlibSessionPolicy';

assert.equal(
  shouldBootstrapPhoneLoginFromLocalStatus('ready'),
  false,
  'ready sticky sessions must not enter phone-login bootstrap/recreate',
);

assert.equal(
  shouldBootstrapPhoneLoginFromLocalStatus('waiting_phone'),
  true,
  'non-ready auth screens can use phone-login bootstrap',
);

assert.equal(
  shouldForceApplyParametersOnWaitTdlibParameters(true),
  false,
  'sticky sessions must not force re-apply TDLib parameters on one WaitTdlibParameters probe',
);

assert.equal(
  shouldForceApplyParametersOnWaitTdlibParameters(false),
  true,
  'cold/no-sticky sessions may force apply TDLib parameters',
);

// Soft recover + wait loop must honor the same sticky gate (prod hole: force:true bypass).
assert.equal(
  shouldForceApplyParametersInSoftOrWaitLoop(true),
  false,
  'softRecover/wait loop must not force-apply on sticky WaitTdlibParameters',
);

assert.equal(
  shouldForceApplyParametersInSoftOrWaitLoop(false),
  true,
  'softRecover/wait loop may force-apply when there is no sticky session',
);

assert.equal(isTrulyClosedAuthState('authorizationStateClosed'), true);
assert.equal(isTrulyClosedAuthState('authorizationStateClosing'), false);
assert.equal(isClosingAuthState('authorizationStateClosing'), true);
assert.equal(isClosedOrClosingAuthState('authorizationStateClosing'), true);
assert.equal(isClosedOrClosingAuthState('authorizationStateReady'), false);

assert.equal(
  shouldAllowHardRecreateOnClosed({
    authState: 'authorizationStateClosed',
    expectEmptyDbAfterLogout: false,
    hardRecreateCountThisProcess: 0,
    maxHardRecreatesPerProcess: 3,
  }),
  true,
  'true Closed may hard-recreate when not logging out',
);

assert.equal(
  shouldAllowHardRecreateOnClosed({
    authState: 'authorizationStateClosing',
    expectEmptyDbAfterLogout: false,
    hardRecreateCountThisProcess: 0,
    maxHardRecreatesPerProcess: 3,
  }),
  false,
  'Closing must not hard-recreate',
);

assert.equal(
  shouldAllowHardRecreateOnClosed({
    authState: 'authorizationStateClosed',
    expectEmptyDbAfterLogout: true,
    hardRecreateCountThisProcess: 0,
    maxHardRecreatesPerProcess: 3,
  }),
  false,
  'LoggingOut / empty-DB expectation must block hard recreate',
);

assert.equal(
  shouldAllowHardRecreateOnClosed({
    authState: 'authorizationStateClosed',
    expectEmptyDbAfterLogout: false,
    hardRecreateCountThisProcess: 3,
    maxHardRecreatesPerProcess: 3,
  }),
  false,
  'hard recreate budget exhausted — refuse',
);

assert.equal(isValidTelegramUserId(0), false, 'placeholder 0 is unset');
assert.equal(isValidTelegramUserId(null), false);
assert.equal(isValidTelegramUserId(42), true);

console.log('tdlibSessionPolicy.test.ts OK');

import assert from 'node:assert/strict';
import {
  shouldBootstrapPhoneLoginFromLocalStatus,
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

console.log('tdlibSessionPolicy.test.ts OK');

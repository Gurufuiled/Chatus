import assert from 'node:assert/strict';
import { sanitizeClientLogText } from './clientRemoteLogSanitize';

assert.equal(
  sanitizeClientLogText('{"apiId":12345678,"deviceModel":"Chatus"}'),
  '{"apiId":12345678,"deviceModel":"Chatus"}',
  'apiId digits must survive OTP scrubber',
);

assert.equal(
  sanitizeClientLogText('{"api_id":1234567}'),
  '{"api_id":1234567}',
  'api_id snake_case preserved',
);

assert.equal(
  sanitizeClientLogText('{"apiId":20401234,"api_id":20401234}'),
  '{"apiId":20401234,"api_id":20401234}',
  'multiple apiId fields both restored',
);

assert.equal(
  sanitizeClientLogText('otp 123456'),
  'otp [code]',
  'bare 6-digit OTP still scrubbed',
);

assert.equal(
  sanitizeClientLogText('{"otp":123456}'),
  '{"otp":[code]}',
  'JSON otp field still scrubbed',
);

assert.match(
  sanitizeClientLogText('{"apiId":12345678,"otp":654321}'),
  /"apiId":12345678/,
  'apiId kept when otp present',
);
assert.match(
  sanitizeClientLogText('{"apiId":12345678,"otp":654321}'),
  /"otp":\[code\]/,
  'otp scrubbed when apiId present',
);

assert.match(
  sanitizeClientLogText('api_hash=deadbeefcafebabe'),
  /api_hash=\[redacted\]/i,
  'api_hash redacted',
);

assert.match(
  sanitizeClientLogText('Bearer eyJhbGciOiJIUzI1NiJ9.abc.def'),
  /Bearer \[redacted\]/,
  'Bearer token redacted',
);

assert.match(
  sanitizeClientLogText('call +7 (999) 123-45-67 now'),
  /\[phone\]/,
  'phone redacted',
);

console.log('clientRemoteLog.test.ts OK');

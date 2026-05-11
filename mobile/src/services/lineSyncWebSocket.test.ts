import assert from 'node:assert/strict';
import { parseLineTailWebSocketPayload } from './lineSyncWebSocketPayload';

function r(msg: unknown) {
  return parseLineTailWebSocketPayload(msg);
}

const notObjectCases: unknown[] = [null, undefined, '', 0];
for (const input of notObjectCases) {
  const p = parseLineTailWebSocketPayload(input);
  assert.equal(p.ok, false);
  if (!p.ok) assert.equal(p.reason, 'not_object');
}

const wrongType = r({});
assert.equal(wrongType.ok, false);
if (!wrongType.ok) assert.equal(wrongType.reason, 'wrong_type');

const wrongType2 = r({ type: 'new_message' });
assert.equal(wrongType2.ok, false);
if (!wrongType2.ok) assert.equal(wrongType2.reason, 'wrong_type');

const errWithLine = r({
  type: 'line_tail',
  line_id: 'chat-1',
  error: 'forbidden',
});
assert.equal(errWithLine.ok, false);
if (!errWithLine.ok && errWithLine.reason === 'server_error') {
  assert.equal(errWithLine.serverErrorMessage, 'forbidden');
}

const errEmptyLineId = r({
  type: 'line_tail',
  line_id: null,
  error: 'line_id_required',
});
assert.equal(errEmptyLineId.ok, false);
if (!errEmptyLineId.ok && errEmptyLineId.reason === 'server_error') {
  assert.equal(errEmptyLineId.serverErrorMessage, 'line_id_required');
}

const missingLine = r({
  type: 'line_tail',
  events: [],
});
assert.equal(missingLine.ok, false);
if (!missingLine.ok) assert.equal(missingLine.reason, 'no_line_id');

const okEmpty = r({
  type: 'line_tail',
  line_id: 'line-a',
  events: [],
});
assert.equal(okEmpty.ok, true);
if (okEmpty.ok) {
  assert.equal(okEmpty.lineId, 'line-a');
  assert.deepEqual(okEmpty.events, []);
}

const okTrim = r({
  type: 'line_tail',
  line_id: '  line-b  ',
  events: [{ x: 1 }],
});
assert.equal(okTrim.ok, true);
if (okTrim.ok) {
  assert.equal(okTrim.lineId, 'line-b');
  assert.equal(okTrim.events.length, 1);
}

const nonArrayEvents = r({
  type: 'line_tail',
  line_id: 'L',
  events: { not: 'array' },
});
assert.equal(nonArrayEvents.ok, true);
if (nonArrayEvents.ok) {
  assert.deepEqual(nonArrayEvents.events, []);
}

const numericError = r({
  type: 'line_tail',
  line_id: 'L',
  error: 404,
});
assert.equal(numericError.ok, false);
if (!numericError.ok && numericError.reason === 'server_error') {
  assert.equal(numericError.serverErrorMessage, '404');
}

/** Empty or whitespace-only `error` is treated as absent so merge can proceed. */
const emptyErrOk = r({
  type: 'line_tail',
  line_id: 'line-empty-err',
  error: '',
  events: [],
});
assert.equal(emptyErrOk.ok, true);
if (emptyErrOk.ok) {
  assert.equal(emptyErrOk.lineId, 'line-empty-err');
}

const whitespaceErrOk = r({
  type: 'line_tail',
  line_id: 'line-ws-err',
  error: '   \t  ',
  events: [],
});
assert.equal(whitespaceErrOk.ok, true);
if (whitespaceErrOk.ok) {
  assert.equal(whitespaceErrOk.lineId, 'line-ws-err');
}

const whitespaceLineId = r({
  type: 'line_tail',
  line_id: '   ',
  events: [],
});
assert.equal(whitespaceLineId.ok, false);
if (!whitespaceLineId.ok) assert.equal(whitespaceLineId.reason, 'no_line_id');

console.log('lineSyncWebSocket.test.ts: PASS');

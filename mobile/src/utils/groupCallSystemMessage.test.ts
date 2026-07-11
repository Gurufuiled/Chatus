import assert from 'node:assert/strict';
import {
  formatGroupCallDialogPreview,
  parseGroupCallSystemContent,
} from './groupCallSystemMessage';

function testParseStartedPayload() {
  const payload = parseGroupCallSystemContent(
    JSON.stringify({
      v: 1,
      kind: 'group_call',
      action: 'started',
      room_id: 'room-1',
      display: 'Аня начала голосовой чат',
    }),
  );
  assert.equal(payload?.action, 'started');
  assert.equal(payload?.room_id, 'room-1');
}

function testParseEndedPayloadWithDuration() {
  const payload = parseGroupCallSystemContent(
    JSON.stringify({
      v: 1,
      kind: 'group_call',
      action: 'ended',
      room_id: 'room-1',
      display: 'Голосовой чат завершён',
      duration_minutes: 12,
    }),
  );
  assert.equal(payload?.action, 'ended');
  assert.equal(payload?.duration_minutes, 12);
}

function testParseRejectsInvalidPayload() {
  assert.equal(parseGroupCallSystemContent('not json'), null);
  assert.equal(parseGroupCallSystemContent(JSON.stringify({ kind: 'other' })), null);
}

function testFormatDialogPreview() {
  assert.equal(
    formatGroupCallDialogPreview(
      JSON.stringify({
        v: 1,
        kind: 'group_call',
        action: 'started',
        room_id: 'room-1',
        display: 'Аня начала голосовой чат',
      }),
    ),
    'Аня начала голосовой чат',
  );
  assert.equal(formatGroupCallDialogPreview('"v":1kind:group_call'), 'Голосовой звонок');
  assert.equal(formatGroupCallDialogPreview('hello'), null);
}

testParseStartedPayload();
testParseEndedPayloadWithDuration();
testParseRejectsInvalidPayload();
testFormatDialogPreview();

console.log('groupCallSystemMessage.test.ts: ok');

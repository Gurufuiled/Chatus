import assert from 'node:assert/strict';
import {
  getGroupCallSystemBubbleBackground,
  parseGroupCallSystemContent,
} from './groupCallSystemMessage';

function testBubbleBackgroundUsesIncomingBubbleColor() {
  assert.equal(getGroupCallSystemBubbleBackground('#FFFFFF'), '#FFFFFF');
  assert.equal(getGroupCallSystemBubbleBackground('#2B2C2E'), '#2B2C2E');
}

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

testBubbleBackgroundUsesIncomingBubbleColor();
testParseStartedPayload();
testParseEndedPayloadWithDuration();
testParseRejectsInvalidPayload();

console.log('groupCallSystemMessage.test.ts: ok');

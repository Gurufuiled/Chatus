import assert from 'node:assert/strict';
import type { Message } from '../stores/types';
import {
  compareChatMessagesNewestFirst,
  insertChatMessageNewestFirst,
  sortChatMessagesNewestFirst,
} from './chatMessageOrder';

function makeMessage(id: string, createdAt: number): Message {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: 'user-1',
    msg_type: 'text',
    content: id,
    reply_to_id: null,
    is_edited: 0,
    is_deleted: 0,
    status: 'sent',
    transport: 'websocket',
    server_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const older = makeMessage('older', 100);
const newer = makeMessage('newer', 200);
assert.deepEqual(sortChatMessagesNewestFirst([older, newer]), [newer, older]);

const existing = [makeMessage('new', 200), makeMessage('old', 100)];
const middle = makeMessage('mid', 150);
assert.deepEqual(
  insertChatMessageNewestFirst(existing, middle).map((m) => m.id),
  ['new', 'mid', 'old'],
);

assert.equal(insertChatMessageNewestFirst(existing, existing[0]!), existing);

const a = makeMessage('a', 100);
const b = makeMessage('b', 100);
assert.ok(compareChatMessagesNewestFirst(a, b) > 0);
assert.ok(compareChatMessagesNewestFirst(b, a) < 0);

console.log('chatMessageOrder.test.ts: ok');

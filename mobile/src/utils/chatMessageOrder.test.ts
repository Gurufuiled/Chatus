import assert from 'node:assert/strict';
import type { Message } from '../stores/types';
import {
  compareChatMessagesNewestFirst,
  insertChatMessageNewestFirst,
  placeOptimisticAtEnd,
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


// ── регрессия: отправляемое сообщение с отстающими часами телефона не должно ложиться посреди переписки ──
{
  const history = [makeMessage('last-server', 10_000), makeMessage('prev', 9_000), makeMessage('old', 5_000)];
  const slowClockMessage: Message = { ...makeMessage('temp-1', 9_500), status: 'sending' };

  const placed = placeOptimisticAtEnd(history, slowClockMessage);
  assert.equal(placed.created_at, 10_001, 'время поднято на единицу выше последнего сообщения');
  assert.ok(placed.updated_at >= placed.created_at);
  assert.deepEqual(
    insertChatMessageNewestFirst(history, placed).map((m) => m.id),
    ['temp-1', 'last-server', 'prev', 'old'],
    'новое сообщение сразу внизу чата (список новых-сверху: первым)',
  );
  // без исправления оно оказалось бы между prev и last-server
  assert.deepEqual(
    insertChatMessageNewestFirst(history, slowClockMessage).map((m) => m.id),
    ['last-server', 'temp-1', 'prev', 'old'],
  );

  // часы телефона идут правильно — время не трогаем
  const fresh: Message = { ...makeMessage('temp-2', 20_000), status: 'sending' };
  assert.equal(placeOptimisticAtEnd(history, fresh), fresh);

  // подряд отправленные сообщения сохраняют порядок отправки
  let chat = history;
  const sent: Message[] = [];
  for (const id of ['temp-a', 'temp-b', 'temp-c']) {
    const m = placeOptimisticAtEnd(chat, { ...makeMessage(id, 9_100), status: 'sending' });
    sent.push(m);
    chat = insertChatMessageNewestFirst(chat, m);
  }
  assert.deepEqual(chat.slice(0, 3).map((m) => m.id), ['temp-c', 'temp-b', 'temp-a']);
  assert.ok(sent[0]!.created_at < sent[1]!.created_at && sent[1]!.created_at < sent[2]!.created_at);

  // подтверждённые и входящие сообщения не двигаем
  const incoming = makeMessage('incoming', 9_500);
  assert.equal(placeOptimisticAtEnd(history, incoming), incoming);
  const failed: Message = { ...makeMessage('temp-f', 9_500), status: 'failed' };
  assert.equal(placeOptimisticAtEnd(history, failed), failed);

  // пустой чат
  assert.equal(placeOptimisticAtEnd([], slowClockMessage), slowClockMessage);
  // то же время, что у последнего, — тоже поднимается (иначе порядок зависел бы от id)
  const same: Message = { ...makeMessage('temp-same', 10_000), status: 'sending' };
  assert.equal(placeOptimisticAtEnd(history, same).created_at, 10_001);
}

console.log('chatMessageOrder.test.ts: ok');

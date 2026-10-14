/**
 * Отправляемые сообщения в сторе: сразу внизу чата, даже если часы телефона отстают от серверных.
 * Регрессия: кружок/голосовое при отправке рисовались посреди переписки и только после подтверждения вставали вниз.
 */
import assert from 'node:assert/strict';
import { messageStore } from './messageStore';
import type { Message } from './types';

const CHAT = 'chat-optimistic';

function makeMessage(id: string, createdAt: number, extra: Partial<Message> = {}): Message {
  return {
    id,
    chat_id: CHAT,
    sender_id: 'me',
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
    ...extra,
  };
}

const ids = () => (messageStore.getState().messagesByChatId[CHAT] ?? []).map((m) => m.id);
const reset = (messages: Message[]) => messageStore.getState().setMessages(CHAT, messages);

// ── голосовое / кружок при отстающих часах: сразу первым в списке «новые сверху» ──
{
  reset([makeMessage('server-3', 30_000), makeMessage('server-2', 20_000), makeMessage('server-1', 10_000)]);
  const voice = makeMessage('temp-voice', 25_000, { status: 'sending', msg_type: 'voice' });
  messageStore.getState().prependMessage(CHAT, voice);
  assert.deepEqual(ids(), ['temp-voice', 'server-3', 'server-2', 'server-1'], 'не посреди переписки');
  const stored = messageStore.getState().messagesByChatId[CHAT]![0]!;
  assert.ok(stored.created_at > 30_000, 'время поднято выше последнего серверного сообщения');
}

// ── addMessage ведёт себя так же ──
{
  reset([makeMessage('server-2', 20_000), makeMessage('server-1', 10_000)]);
  messageStore.getState().addMessage(CHAT, makeMessage('temp-note', 15_000, { status: 'sending', msg_type: 'video_note' }));
  assert.deepEqual(ids(), ['temp-note', 'server-2', 'server-1']);
}

// ── после подтверждения сервера порядок не «перепрыгивает» ──
{
  reset([makeMessage('server-2', 20_000), makeMessage('server-1', 10_000)]);
  messageStore.getState().prependMessage(CHAT, makeMessage('temp-1', 12_000, { status: 'sending' }));
  assert.equal(ids()[0], 'temp-1');
  // сервер подтвердил: настоящее время новее всех
  messageStore.getState().updateMessage(CHAT, 'temp-1', { id: 'srv-1', status: 'sent', created_at: 20_500 });
  assert.deepEqual(ids(), ['srv-1', 'server-2', 'server-1'], 'как и раньше — внизу, перескока нет');
}

// ── несколько подряд сохраняют порядок отправки ──
{
  reset([makeMessage('server-1', 10_000)]);
  for (const id of ['temp-a', 'temp-b', 'temp-c']) {
    messageStore.getState().prependMessage(CHAT, makeMessage(id, 5_000, { status: 'sending' }));
  }
  assert.deepEqual(ids(), ['temp-c', 'temp-b', 'temp-a', 'server-1']);
}

// ── часы телефона идут правильно или сообщение чужое: время не меняется ──
{
  reset([makeMessage('server-1', 10_000)]);
  messageStore.getState().prependMessage(CHAT, makeMessage('temp-fresh', 50_000, { status: 'sending' }));
  assert.equal(messageStore.getState().messagesByChatId[CHAT]![0]!.created_at, 50_000);

  messageStore.getState().prependMessage(CHAT, makeMessage('incoming', 20_000, { sender_id: 'other' }));
  const incoming = messageStore.getState().messagesByChatId[CHAT]!.find((m) => m.id === 'incoming')!;
  assert.equal(incoming.created_at, 20_000, 'входящее и подтверждённое не двигаем');
}

// ── пустой чат и дубликаты ──
{
  reset([]);
  messageStore.getState().prependMessage(CHAT, makeMessage('temp-only', 1_000, { status: 'sending' }));
  assert.deepEqual(ids(), ['temp-only']);
  messageStore.getState().prependMessage(CHAT, makeMessage('temp-only', 2_000, { status: 'sending' }));
  assert.deepEqual(ids(), ['temp-only'], 'дубликат не добавляется');
}

console.log('messageStore.optimistic.test.ts: ok');

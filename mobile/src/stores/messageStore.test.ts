import assert from 'node:assert/strict';
import { messageStore } from './messageStore';
import type { Message } from './types';

function makeMessage(id: string, status: string): Message {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: 'me',
    msg_type: 'text',
    content: '.',
    reply_to_id: null,
    is_edited: 0,
    is_deleted: 0,
    status,
    transport: 'websocket',
    server_id: null,
    created_at: 1,
    updated_at: 1,
  };
}

messageStore.getState().clearMessages('chat-1');
messageStore.getState().addMessage('chat-1', makeMessage('temp-1', 'sending'));
messageStore.getState().updateMessage('chat-1', 'temp-1', {
  id: 'server-1',
  ui_key: 'temp-1',
  status: 'sent',
});

let current = messageStore.getState().messagesByChatId['chat-1'];
assert.equal(current.length, 1);
assert.equal(current[0].id, 'server-1');
assert.equal(current[0].ui_key, 'temp-1');

messageStore.getState().setMessages('chat-1', [makeMessage('server-1', 'read')]);
current = messageStore.getState().messagesByChatId['chat-1'];
assert.equal(current[0].ui_key, 'temp-1', 'server refresh must keep the stable FlatList key');
assert.equal(current[0].status, 'read');

messageStore.getState().clearMessages('chat-1');
console.log('messageStore stable optimistic key tests: OK');

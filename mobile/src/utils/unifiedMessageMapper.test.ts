import assert from 'node:assert/strict';

import { telegramToUnified } from './unifiedMessageMapper';

const text = telegramToUnified(
  {
    id: 42,
    chat_id: 100,
    date: 1_700_000_000,
    is_outgoing: true,
    sender_id: { '@type': 'messageSenderUser', user_id: 7 },
    content: {
      '@type': 'messageText',
      text: { '@type': 'formattedText', text: '.' },
    },
  },
  'chatus-me',
);

assert.ok(text);
assert.equal(text.id, 'telegram:42');
assert.equal(text.content, '.');
assert.equal(text.sender_id, 'chatus-me');
assert.equal(text.source, 'telegram');

const incoming = telegramToUnified(
  {
    id: 43,
    chat_id: 100,
    date: 1_700_000_001,
    is_outgoing: false,
    sender_id: { '@type': 'messageSenderUser', user_id: 77 },
    content: {
      '@type': 'messageText',
      text: { '@type': 'formattedText', text: 'Привет' },
    },
  },
  'chatus-me',
);
assert.ok(incoming);
assert.equal(incoming.sender_id, '77');
assert.equal(incoming.content, 'Привет');

const unsupported = telegramToUnified(
  {
    id: 44,
    chat_id: 100,
    content: { '@type': 'messageChatChangeTitle', title: 'Новое имя' },
  },
  'chatus-me',
);
assert.equal(unsupported, null);

console.log('unifiedMessageMapper Telegram mapping tests: OK');

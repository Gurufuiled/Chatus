import assert from 'node:assert/strict';
import { findActiveVoiceMessage, type ActiveVoiceCandidate } from './activeVoiceMessage';

const voice = (id: string, remoteUrl?: string | null): ActiveVoiceCandidate => ({
  id,
  msg_type: 'voice',
  media: remoteUrl === undefined ? [] : [{ remote_url: remoteUrl }],
});
const text = (id: string): ActiveVoiceCandidate => ({ id, msg_type: 'text', media: [] });

const messages = [text('t1'), voice('v1', '/uploads/a.m4a'), voice('v2', 'https://cdn/x/b.m4a'), voice('v3')];
const abs = (uri: string) => (uri.startsWith('/') ? `https://api.example${uri}` : uri);

// ── по ключу сообщения ──
assert.equal(findActiveVoiceMessage(messages, { key: 'v2', uri: null })?.id, 'v2');
assert.equal(
  findActiveVoiceMessage(messages, { key: 'v2', uri: 'file:///cache/voice-playback-cache/abc.m4a' }, abs)?.id,
  'v2',
  'регрессия: играет локальный кэш (адрес не совпадает с remote_url) — плашка всё равно находит сообщение',
);
// ключ чужого (не голосового) сообщения не считается
assert.equal(findActiveVoiceMessage(messages, { key: 't1', uri: null }), null);
// ключа нет в списке, но адрес совпадает
assert.equal(findActiveVoiceMessage(messages, { key: 'gone', uri: '/uploads/a.m4a' })?.id, 'v1');

// ── по адресу (запасной путь, как раньше) ──
assert.equal(findActiveVoiceMessage(messages, { key: null, uri: '/uploads/a.m4a' })?.id, 'v1', 'прямое совпадение');
assert.equal(
  findActiveVoiceMessage(messages, { key: null, uri: 'https://api.example/uploads/a.m4a' }, abs)?.id,
  'v1',
  'пузырь играет абсолютный адрес, а в сообщении относительный',
);
assert.equal(findActiveVoiceMessage(messages, { key: null, uri: 'file://v3' })?.id, 'v3', 'сообщение без remote_url');
assert.equal(
  findActiveVoiceMessage(
    messages,
    { key: null, uri: 'file:///local/v3.m4a' },
    abs,
    (m) => (m.id === 'v3' ? 'file:///local/v3.m4a' : null),
  )?.id,
  'v3',
  'свой запасной адрес для сообщения',
);

// ── ничего не играет / не найдено ──
assert.equal(findActiveVoiceMessage(messages, { key: null, uri: null }), null);
assert.equal(findActiveVoiceMessage(messages, { key: '', uri: '   ' }), null);
assert.equal(findActiveVoiceMessage(messages, { key: null, uri: 'https://other/z.m4a' }, abs), null);
assert.equal(findActiveVoiceMessage([], { key: 'v1', uri: '/uploads/a.m4a' }), null);
// адрес текстового сообщения не совпадает с голосовыми
assert.equal(findActiveVoiceMessage([text('t1')], { key: null, uri: 'file://t1' }), null);

console.log('activeVoiceMessage.test.ts: ok');

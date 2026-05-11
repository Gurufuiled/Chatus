import assert from 'node:assert/strict';
import { normalizeMessageTransport } from './messageTransport';

type Case = [unknown, ReturnType<typeof normalizeMessageTransport>];

const cases: Case[] = [
  ['websocket', 'websocket'],
  ['WebSocket', 'websocket'],
  ['api', 'websocket'],
  ['ws', 'websocket'],
  ['server', 'websocket'],
  ['  SERVER  ', 'websocket'],
  [null, 'websocket'],
  ['', 'websocket'],
  ['unknown-mode', 'websocket'],
  ['p2p', 'p2p'],
  ['P2P', 'p2p'],
];

for (const [input, expected] of cases) {
  assert.equal(normalizeMessageTransport(input), expected);
}

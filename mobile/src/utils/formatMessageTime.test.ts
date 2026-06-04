import assert from 'node:assert/strict';
import { formatMessageTimeWithHour12 } from './formatMessageTimeCore';

const noon = new Date('2026-05-25T14:30:00').getTime();

const h24 = formatMessageTimeWithHour12(noon, false);
assert.match(h24, /14:30/, `expected 24h, got ${h24}`);

const h12 = formatMessageTimeWithHour12(noon, true);
assert.match(h12, /PM|pm|2:30/, `expected 12h, got ${h12}`);

console.log('formatMessageTime.test.ts: ok');

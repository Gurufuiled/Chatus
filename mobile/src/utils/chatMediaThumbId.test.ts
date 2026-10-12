import assert from 'node:assert/strict';
import { chatMediaThumbId } from './chatMediaThumbId';

// основной адрес файла
assert.equal(chatMediaThumbId({ remote_url: 'https://x/y.jpg' }), 'chat-media:https://x/y.jpg');
// пробелы по краям не создают «другой» ключ — плитка и вьювер всегда совпадают
assert.equal(
  chatMediaThumbId({ remote_url: '  https://x/y.jpg ' }),
  chatMediaThumbId({ remote_url: 'https://x/y.jpg' }),
);
// remote_url нет — берём превью
assert.equal(chatMediaThumbId({ thumbnail_url: 'https://x/t.jpg' }), 'chat-media:https://x/t.jpg');
// remote_url приоритетнее превью
assert.equal(
  chatMediaThumbId({ remote_url: 'https://x/full.jpg', thumbnail_url: 'https://x/t.jpg' }),
  'chat-media:https://x/full.jpg',
);
// разные файлы — разные ключи
assert.notEqual(
  chatMediaThumbId({ remote_url: 'https://x/a.jpg' }),
  chatMediaThumbId({ remote_url: 'https://x/b.jpg' }),
);
// пустые/отсутствующие значения не падают
assert.equal(chatMediaThumbId(undefined), 'chat-media:');
assert.equal(chatMediaThumbId(null), 'chat-media:');
assert.equal(chatMediaThumbId({}), 'chat-media:');

console.log('chatMediaThumbId.test.ts: ok');

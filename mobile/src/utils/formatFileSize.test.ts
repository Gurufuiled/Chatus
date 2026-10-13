import assert from 'node:assert/strict';
import { formatFileSize } from './formatFileSize';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

assert.equal(formatFileSize(512), '512 Б');
assert.equal(formatFileSize(1), '1 Б');
assert.equal(formatFileSize(KB), '1.0 КБ');
assert.equal(formatFileSize(1536), '1.5 КБ');
assert.equal(formatFileSize(MB - 1), '1024.0 КБ');
assert.equal(formatFileSize(MB), '1.0 МБ');
assert.equal(formatFileSize(48 * MB), '48.0 МБ');
assert.equal(formatFileSize(GB), '1.0 ГБ');
assert.equal(formatFileSize(2.5 * GB), '2.5 ГБ');

// неизвестный размер — пустая строка (на кнопке подписи не будет)
assert.equal(formatFileSize(undefined), '');
assert.equal(formatFileSize(null), '');
assert.equal(formatFileSize(0), '');
assert.equal(formatFileSize(-5), '');

console.log('formatFileSize.test.ts: ok');

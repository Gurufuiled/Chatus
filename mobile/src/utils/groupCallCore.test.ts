import assert from 'node:assert/strict';
import { normalizeStartedAt, resolveCallStartedAt } from './groupCallCore';

const MS = 1_760_000_000_000; // 2025-10 в миллисекундах
const SEC = 1_760_000_000;

// числа
assert.equal(normalizeStartedAt(MS), MS, 'миллисекунды остаются как есть');
assert.equal(normalizeStartedAt(SEC), SEC * 1000, 'секунды переводятся в миллисекунды');
assert.equal(normalizeStartedAt(0), undefined);
assert.equal(normalizeStartedAt(-5), undefined);
assert.equal(normalizeStartedAt(NaN), undefined);
assert.equal(normalizeStartedAt(Infinity), undefined);

// строки с числом (регрессия: раньше шли в Date.parse, который для таких строк ненадёжен)
assert.equal(normalizeStartedAt(String(SEC)), SEC * 1000);
assert.equal(normalizeStartedAt(String(MS)), MS);
assert.equal(normalizeStartedAt(`  ${SEC}  `), SEC * 1000, 'пробелы по краям');
assert.equal(normalizeStartedAt('1760000000.5'), 1_760_000_000.5 * 1000, 'дробные секунды');
assert.equal(normalizeStartedAt('0'), undefined);

// ISO-даты
assert.equal(normalizeStartedAt('2025-10-14T12:00:00Z'), Date.parse('2025-10-14T12:00:00Z'));
assert.equal(normalizeStartedAt('2025-10-14T12:00:00.000+03:00'), Date.parse('2025-10-14T09:00:00Z'));

// мусор
assert.equal(normalizeStartedAt(''), undefined);
assert.equal(normalizeStartedAt('   '), undefined);
assert.equal(normalizeStartedAt('вчера'), undefined);
assert.equal(normalizeStartedAt(undefined), undefined);
assert.equal(normalizeStartedAt(null), undefined);

// resolveCallStartedAt: первый пригодный кандидат
assert.equal(resolveCallStartedAt(undefined, null, '', SEC, MS), SEC * 1000);
assert.equal(resolveCallStartedAt(MS, SEC), MS);
assert.equal(resolveCallStartedAt('мусор', 0, undefined), undefined);
assert.equal(resolveCallStartedAt(), undefined);
// пропускает непригодное и берёт следующее, даже если оно строка
assert.equal(resolveCallStartedAt(NaN, String(SEC)), SEC * 1000);

console.log('groupCallCore.test.ts: ok');

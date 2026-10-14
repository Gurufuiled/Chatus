import assert from 'node:assert/strict';
import { TD_WAVEFORM_MAX_SAMPLES, decodeTdWaveform, encodeTdWaveform } from './tdVoiceWaveform';

const close = (a: number, b: number, eps: number, msg: string) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// ── известный вектор: значения 0..31 по 5 бит, младшие биты первыми ──
{
  // значения [1, 2, 3]: 1 | (2<<5) | (3<<10) = 3137 = 0x0C41 → little-endian байты 41 0C → base64 "QQw="
  const encoded = encodeTdWaveform([1 / 31, 2 / 31, 3 / 31]);
  assert.equal(encoded, 'QQw=');
  const decoded = decodeTdWaveform('QQw=');
  assert.equal(decoded.length, 3);
  close(decoded[0], 1 / 31, 1e-9, '0');
  close(decoded[1], 2 / 31, 1e-9, '1');
  close(decoded[2], 3 / 31, 1e-9, '2');
}

// ── круговой обход: потеря только на квантовании 5 бит ──
{
  const samples = Array.from({ length: 64 }, (_, i) => (Math.sin(i / 5) + 1) / 2);
  const back = decodeTdWaveform(encodeTdWaveform(samples));
  assert.ok(back.length >= samples.length, 'число значений сохраняется (плюс не более одного хвостового нуля)');
  assert.ok(back.length <= samples.length + 1);
  samples.forEach((value, i) => close(back[i], value, 0.5 / 31 + 1e-9, `значение ${i}`));
}
// все 32 уровня проходят без искажений, на любых смещениях
for (let count = 1; count <= 40; count += 1) {
  const levels = Array.from({ length: count }, (_, i) => (i % 32) / 31);
  const back = decodeTdWaveform(encodeTdWaveform(levels));
  levels.forEach((value, i) => close(back[i], value, 1e-9, `count=${count}, i=${i}`));
}

// ── границы значений и мусор ──
assert.deepEqual(decodeTdWaveform(encodeTdWaveform([0, 0, 0, 0])).slice(0, 4), [0, 0, 0, 0]);
assert.deepEqual(decodeTdWaveform(encodeTdWaveform([1, 1, 1, 1])).slice(0, 4), [1, 1, 1, 1]);
assert.deepEqual(decodeTdWaveform(encodeTdWaveform([5, -3, NaN])).slice(0, 3), [1, 0, 0], 'вне диапазона обрезается');
assert.equal(encodeTdWaveform([]), '');
assert.equal(encodeTdWaveform(null), '');
assert.equal(encodeTdWaveform(undefined), '');
assert.deepEqual(decodeTdWaveform(''), []);
assert.deepEqual(decodeTdWaveform(null), []);
assert.deepEqual(decodeTdWaveform(undefined), []);
assert.deepEqual(decodeTdWaveform('!!!не base64!!!'), []);

// ── не больше 100 значений ──
assert.equal(TD_WAVEFORM_MAX_SAMPLES, 100);
{
  const long = Array.from({ length: 250 }, () => 0.5);
  const back = decodeTdWaveform(encodeTdWaveform(long));
  assert.ok(back.length <= TD_WAVEFORM_MAX_SAMPLES + 1);
}

// ── регрессия: раньше каждый байт читали как значение (byte/31) — получались числа > 1 ──
{
  // «забитые» байты 0xFF: старый разбор дал бы 255/31 ≈ 8.2 на каждый байт
  const decoded = decodeTdWaveform('//8=');
  assert.ok(decoded.every((v) => v >= 0 && v <= 1), 'все значения в 0..1');
  assert.equal(decoded[0], 1);
}

console.log('tdVoiceWaveform.test.ts: ok');

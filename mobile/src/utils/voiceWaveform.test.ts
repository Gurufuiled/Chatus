import assert from 'node:assert/strict';
import {
  VOICE_BAR_FALLBACK_COUNT,
  VOICE_BAR_MAX_HEIGHT,
  VOICE_BAR_MIN_HEIGHT,
  buildDecorativeBars,
  buildVoiceBars,
  filledBarCount,
  positionMsForRatio,
  resampleToBars,
  voiceBarCountForWidth,
  voiceBarHeight,
  waveformRatioFromX,
} from './voiceWaveform';

const inRange = (values: number[]) => values.every((v) => v >= 0 && v <= 1);

// ── число столбиков по ширине (шаг 4 px: столбик 2 + промежуток 2) ──
assert.equal(voiceBarCountForWidth(0), VOICE_BAR_FALLBACK_COUNT, 'ширина неизвестна — запасное число');
assert.equal(voiceBarCountForWidth(-5), VOICE_BAR_FALLBACK_COUNT);
assert.equal(voiceBarCountForWidth(NaN), VOICE_BAR_FALLBACK_COUNT);
assert.equal(voiceBarCountForWidth(182), 46, '(182+2)/4');
assert.equal(voiceBarCountForWidth(10), 16, 'не меньше минимума');
assert.equal(voiceBarCountForWidth(5000), 90, 'не больше максимума');
assert.ok(voiceBarCountForWidth(200) > voiceBarCountForWidth(150), 'шире дорожка — больше столбиков');

// ── resampleToBars ──
assert.deepEqual(resampleToBars([], 4), [0, 0, 0, 0]);
assert.deepEqual(resampleToBars([0.5], 3), [0.5, 0.5, 0.5]);
assert.deepEqual(resampleToBars([0.1, 0.2], 0), []);
{
  // вниз: пик не теряется (в корзине с пиком значение ближе к пику, чем к среднему)
  const down = resampleToBars([0, 0, 0, 1, 0, 0, 0, 0], 4);
  assert.equal(down.length, 4);
  assert.ok(down[1] > 0.6, 'пик сохранён');
  assert.equal(down[0], 0);
  assert.equal(down[3], 0);
}
{
  // вверх: интерполяция, края сохраняются
  const up = resampleToBars([0, 1], 5);
  assert.equal(up.length, 5);
  assert.equal(up[0], 0);
  assert.equal(up[4], 1);
  assert.ok(up[1] < up[2] && up[2] < up[3], 'монотонно');
}

// ── регрессия: тишина не растягивается до «крика» ──
{
  const silence = buildVoiceBars(Array(80).fill(0.004), 40, 'a');
  assert.equal(silence.length, 40);
  assert.ok(Math.max(...silence) < 0.1, 'почти нулевая запись остаётся ровными точками');
  assert.equal(new Set(silence).size, 1, 'и они одинаковые');
}
{
  // речь с паузами: паузы внизу, речь вверху
  const speech: number[] = [];
  for (let i = 0; i < 80; i += 1) speech.push(i % 20 < 8 ? 0.012 : 0.4 + (i % 5) * 0.08);
  const bars = buildVoiceBars(speech, 40, 'b');
  const quiet = bars.filter((_, i) => speech[i * 2] < 0.05);
  const loud = bars.filter((_, i) => speech[i * 2] > 0.3);
  assert.ok(quiet.length > 0 && loud.length > 0);
  assert.ok(Math.max(...quiet) < 0.3, `паузы низкие: ${Math.max(...quiet)}`);
  assert.ok(Math.min(...loud) > 0.5, `речь высокая: ${Math.min(...loud)}`);
  assert.equal(Math.max(...bars), 1, 'самое громкое место — на всю высоту');
}
{
  // дорожка со старым шумовым полом (старые сообщения: шум ~0.2, речь ~0.8) — пол отсекается
  const legacy: number[] = [];
  for (let i = 0; i < 60; i += 1) legacy.push(i % 10 < 4 ? 0.2 + (i % 3) * 0.02 : 0.7 + (i % 4) * 0.05);
  const bars = buildVoiceBars(legacy, 30, 'c');
  assert.ok(Math.min(...bars) < 0.1, 'шумовой пол старых записей не превращается в средние столбики');
}
{
  // ровная запись без перепадов — средние ровные столбики, а не искусственная гребёнка
  const flat = buildVoiceBars(Array(60).fill(0.5), 30, 'd');
  assert.ok(Math.max(...flat) - Math.min(...flat) < 0.01);
  assert.ok(flat[0] > 0.3 && flat[0] < 0.7);
}
assert.ok(inRange(buildVoiceBars([5, -3, NaN, 0.5], 10, 'e')), 'мусор во входе не ломает диапазон');

// ── нет данных о громкости: детерминированная заглушка ──
{
  const a = buildVoiceBars([], 40, 'same', 5000);
  const b = buildVoiceBars(null, 40, 'same', 5000);
  const c = buildVoiceBars(undefined, 40, 'other', 5000);
  assert.deepEqual(a, b, 'одинаково для одного голосового');
  assert.notDeepEqual(a, c, 'разные голосовые — разные заглушки');
  assert.equal(a.length, 40);
  assert.ok(inRange(a));
  assert.deepEqual(buildDecorativeBars(10, 'x'), buildDecorativeBars(10, 'x'));
}
assert.deepEqual(buildVoiceBars([0.5], 0), []);

// ── высота столбика ──
assert.equal(voiceBarHeight(0), VOICE_BAR_MIN_HEIGHT);
assert.equal(voiceBarHeight(1), VOICE_BAR_MAX_HEIGHT);
assert.equal(voiceBarHeight(0.5), (VOICE_BAR_MIN_HEIGHT + VOICE_BAR_MAX_HEIGHT) / 2);
assert.equal(voiceBarHeight(7), VOICE_BAR_MAX_HEIGHT, 'вне диапазона — обрезается');
assert.equal(voiceBarHeight(-1), VOICE_BAR_MIN_HEIGHT);
assert.equal(voiceBarHeight(NaN), VOICE_BAR_MIN_HEIGHT);

// ── перемотка пальцем: координата → доля → позиция ──
assert.equal(waveformRatioFromX(50, 200), 0.25);
assert.equal(waveformRatioFromX(-20, 200), 0, 'палец левее дорожки — начало');
assert.equal(waveformRatioFromX(999, 200), 1, 'правее — конец');
assert.equal(waveformRatioFromX(10, 0), 0, 'ширина неизвестна');
assert.equal(waveformRatioFromX(NaN, 200), 0);
assert.equal(positionMsForRatio(0.5, 10_000), 5000);
assert.equal(positionMsForRatio(1.5, 10_000), 10_000);
assert.equal(positionMsForRatio(-1, 10_000), 0);
assert.equal(positionMsForRatio(0.5, 0), 0, 'длительность неизвестна');
assert.equal(positionMsForRatio(0.333, 3000), 999);

// ── сколько столбиков закрашено ──
assert.equal(filledBarCount(0, 40), 0);
assert.equal(filledBarCount(-0.2, 40), 0);
assert.equal(filledBarCount(0.5, 40), 20);
assert.equal(filledBarCount(0.001, 40), 1, 'как только пошёл прогресс — закрашен первый');
assert.equal(filledBarCount(1, 40), 40);
assert.equal(filledBarCount(3, 40), 40);
assert.equal(filledBarCount(0.5, 0), 0);
assert.equal(filledBarCount(NaN, 40), 0);

console.log('voiceWaveform.test.ts: ok');

import assert from 'node:assert/strict';
import {
  MIN_MEDIA_WIDTH_RATIO,
  computeMediaDisplaySize,
  shouldFloatMediaReactions,
  voiceBubbleWidth,
} from './mediaBubbleLayout';

const FALLBACK = { width: 240, height: 300 };
const MAX_W = 270;
const MAX_H = 360;
const size = (w: number, h: number) => computeMediaDisplaySize(w, h, MAX_W, MAX_H, FALLBACK);

// ── обычные пропорции: просто масштаб под предел, без увеличения ──
assert.deepEqual(size(1280, 720), { width: 270, height: 152 }, 'горизонтальное — по ширине');
assert.deepEqual(size(100, 80), { width: 100, height: 80 }, 'маленькое не увеличивается');
assert.deepEqual(size(800, 800), { width: 270, height: 270 }, 'квадрат');
assert.deepEqual(size(1000, 1200), { width: 270, height: 324 }, 'слегка вытянутое (1.2) — по ширине, высота в пределах');

// ── регрессия: вытянутое по вертикали видео не должно быть узким (подпись со временем не помещалась в строку) ──
{
  const portrait = size(576, 1024); // 9:16
  assert.ok(portrait.width >= Math.round(MAX_W * MIN_MEDIA_WIDTH_RATIO), `ширина ${portrait.width} не меньше 90% максимума`);
  assert.equal(portrait.height, MAX_H, 'высота ограничена пределом, картинка обрежется по высоте');
  // раньше: ширина ужималась под высоту — 576 * (360/1024) ≈ 202
  assert.ok(portrait.width > 202, 'шире прежних 202');
  assert.ok(portrait.width <= MAX_W);
}
{
  const tall = size(400, 1200); // очень вытянутое
  assert.equal(tall.width, Math.round(MAX_W * MIN_MEDIA_WIDTH_RATIO));
  assert.equal(tall.height, MAX_H);
}
{
  // портрет, который и так достаточно широк, не трогаем
  const wide = size(900, 1200); // 1.33 > 1.28, по ширине 270 → высота 360 влезает
  assert.deepEqual(wide, { width: 270, height: 360 });
}
{
  // маленький портрет: расширяется до минимума, высота пропорциональна (не выше предела)
  const small = size(120, 240);
  assert.equal(small.width, 243);
  assert.equal(small.height, Math.min(MAX_H, Math.round(240 * (243 / 120))));
}

// ── некорректные размеры → запасные, в пределах ──
assert.deepEqual(size(0, 0), { width: 240, height: 300 });
assert.deepEqual(size(-5, 100), { width: 240, height: 300 });
assert.deepEqual(size(NaN, 100), { width: 240, height: 300 });
assert.deepEqual(computeMediaDisplaySize(0, 0, 200, 250, FALLBACK), { width: 200, height: 250 }, 'запасной размер не выходит за предел');

// ── свой коэффициент минимума ──
assert.equal(computeMediaDisplaySize(400, 1200, MAX_W, MAX_H, FALLBACK, 0.5).width, 135);

// ── реакции под пузырём только у медиа без подписи ──
const base = { hasReactions: true, hasCaption: false, hasFooter: false, embedded: false, incomingChannelPost: false };
assert.equal(shouldFloatMediaReactions(base), true);
assert.equal(shouldFloatMediaReactions({ ...base, hasReactions: false }), false, 'нет реакций — нечего выносить');
assert.equal(shouldFloatMediaReactions({ ...base, hasCaption: true }), false, 'с подписью реакции внутри пузыря');
assert.equal(shouldFloatMediaReactions({ ...base, hasFooter: true }), false, 'с подвалом канала — внутри');
assert.equal(shouldFloatMediaReactions({ ...base, embedded: true }), false, 'во вложенном виде (ответ) — внутри');
assert.equal(shouldFloatMediaReactions({ ...base, incomingChannelPost: true }), false, 'пост канала — прежний вид');

// ── ширина пузыря голосового зависит от длительности ──
const SCREEN = 411;
const w0 = voiceBubbleWidth(0, SCREEN);
const w9 = voiceBubbleWidth(9_000, SCREEN);
const w20 = voiceBubbleWidth(20_000, SCREEN);
const w40 = voiceBubbleWidth(40_000, SCREEN);
const w300 = voiceBubbleWidth(300_000, SCREEN);
const maxWidth = Math.min(SCREEN * 0.72, 290);
assert.ok(w0 < w9 && w9 < w20 && w20 < w40, 'чем длиннее голосовое, тем шире пузырь');
assert.equal(w40, Math.round(maxWidth), 'с 40 с — максимум');
assert.equal(w300, Math.round(maxWidth), 'дальше не растёт');
assert.ok(w9 < maxWidth - 60, `9-секундное заметно уже максимума (${w9} vs ${maxWidth})`);
assert.ok(w0 >= 170, 'не уже минимума: помещаются реакция и время');
assert.equal(voiceBubbleWidth(-1, SCREEN), w0);
assert.equal(voiceBubbleWidth(NaN, SCREEN), w0);
// на узком экране пузырь не вылезает за экран
assert.ok(voiceBubbleWidth(60_000, 320) <= 320 * 0.72 + 1);
assert.ok(voiceBubbleWidth(0, 320) <= voiceBubbleWidth(60_000, 320));

console.log('mediaBubbleLayout.test.ts: ok');

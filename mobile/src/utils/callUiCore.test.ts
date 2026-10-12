import assert from 'node:assert/strict';
import {
  buildInitial,
  buildOfferOptions,
  formatCallDuration,
  getCallControlsLayout,
  getCallKindFromOffer,
  getPhaseCaption,
  getStatusText,
} from './callUiCore';

// ── formatCallDuration ──
const t0 = 1_760_000_000_000;
assert.equal(formatCallDuration(undefined, t0), 'Соединение установлено');
assert.equal(formatCallDuration(0, t0), 'Соединение установлено');
assert.equal(formatCallDuration(t0, t0), '0:00');
assert.equal(formatCallDuration(t0, t0 + 999), '0:00', 'до полной секунды — ещё 0:00');
assert.equal(formatCallDuration(t0, t0 + 1000), '0:01');
assert.equal(formatCallDuration(t0, t0 + 59_000), '0:59');
assert.equal(formatCallDuration(t0, t0 + 60_000), '1:00');
assert.equal(formatCallDuration(t0, t0 + 61_000), '1:01');
assert.equal(formatCallDuration(t0, t0 + 3_599_000), '59:59');
assert.equal(formatCallDuration(t0, t0 + 3_600_000), '60:00', 'часы не выделяются: минуты растут дальше');
assert.equal(formatCallDuration(t0, t0 - 5000), '0:00', 'часы телефона ушли назад — не отрицательное время');

// ── buildInitial ──
assert.equal(buildInitial('аня'), 'А');
assert.equal(buildInitial('  Boris'), 'B');
assert.equal(buildInitial(''), '?');
assert.equal(buildInitial('   '), '?');

// ── getStatusText ──
assert.equal(getStatusText(null, t0), '');
assert.equal(getStatusText({ phase: 'incoming' }, t0), 'Входящий звонок');
assert.equal(getStatusText({ phase: 'outgoing' }, t0), 'Вызываем...');
assert.equal(getStatusText({ phase: 'connecting' }, t0), 'Соединяем...');
assert.equal(getStatusText({ phase: 'active', startedAt: t0 }, t0 + 65_000), '1:05');
assert.equal(getStatusText({ phase: 'active' }, t0), 'Соединение установлено');

// ── getPhaseCaption ──
assert.equal(getPhaseCaption(null), '');
assert.equal(getPhaseCaption({ phase: 'incoming', callKind: 'audio' }), 'Голосовой звонок');
assert.equal(getPhaseCaption({ phase: 'incoming', callKind: 'video' }), 'Видеозвонок');
assert.equal(getPhaseCaption({ phase: 'outgoing', callKind: 'audio' }), 'Ожидаем ответа');
assert.equal(getPhaseCaption({ phase: 'outgoing', callKind: 'video' }), 'Ожидаем ответа на видео');
assert.equal(getPhaseCaption({ phase: 'connecting', callKind: 'audio' }), 'Подключаем аудио');
assert.equal(getPhaseCaption({ phase: 'connecting', callKind: 'video' }), 'Подключаем видео');
assert.equal(getPhaseCaption({ phase: 'active', callKind: 'audio' }), 'Голосовой разговор');
assert.equal(getPhaseCaption({ phase: 'active', callKind: 'video' }), 'Видеозвонок');

// ── getCallKindFromOffer ──
assert.equal(getCallKindFromOffer('video'), 'video');
assert.equal(getCallKindFromOffer('audio'), 'audio');
assert.equal(getCallKindFromOffer(undefined), 'audio', 'старый клиент без call_type');
assert.equal(getCallKindFromOffer('garbage' as never), 'audio');

// ── buildOfferOptions ──
assert.deepEqual(buildOfferOptions(true), { offerToReceiveAudio: true, offerToReceiveVideo: true });
assert.deepEqual(buildOfferOptions(false), { offerToReceiveAudio: true, offerToReceiveVideo: false });

// ── getCallControlsLayout: три класса экрана, границы 340 и 380 включительно ──
const small = getCallControlsLayout(320);
const medium = getCallControlsLayout(360);
const large = getCallControlsLayout(411);
assert.deepEqual(getCallControlsLayout(340), small, '340 ещё «малый»');
assert.notDeepEqual(getCallControlsLayout(341), small);
assert.deepEqual(getCallControlsLayout(380), medium, '380 ещё «средний»');
assert.notDeepEqual(getCallControlsLayout(381), medium);
// чем шире экран, тем крупнее кнопки и подписи
assert.ok(small.circleSize < medium.circleSize && medium.circleSize < large.circleSize);
assert.ok(small.labelFontSize < medium.labelFontSize && medium.labelFontSize < large.labelFontSize);
// главная кнопка всегда крупнее обычной, иконка помещается в круг
for (const l of [small, medium, large]) {
  assert.ok(l.prominentCircleSize > l.circleSize);
  assert.ok(l.prominentIconSize > l.iconSize);
  assert.ok(l.iconSize < l.circleSize && l.prominentIconSize < l.prominentCircleSize);
}
// три кнопки в ряд (круги + промежутки + поля) помещаются в ширину экрана на всех размерах
for (const w of [280, 320, 340, 360, 380, 411, 480]) {
  const l = getCallControlsLayout(w);
  const rowWidth = 3 * l.circleSize + 2 * l.rowGap + 2 * l.screenHorizontalPadding;
  assert.ok(rowWidth <= w, `ряд из 3 кнопок не помещается на ${w}px (нужно ${rowWidth})`);
}

console.log('callUiCore.test.ts: ok');

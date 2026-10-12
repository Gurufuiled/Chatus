import assert from 'node:assert/strict';
import {
  BAR_HEIGHT,
  BAR_INSET,
  BAR_RADIUS,
  FLIP_BUTTON_SIZE,
  RAIL_WIDTH,
  SEND_BUTTON_SIZE,
  TIMER_PILL_HEIGHT,
  rightCenterOffset,
} from './videoNoteRecorderLayout';

// кнопка отправки целиком помещается в плашку с равным отступом со всех сторон
assert.equal(BAR_HEIGHT, SEND_BUTTON_SIZE + 2 * BAR_INSET);
assert.equal(BAR_RADIUS * 2, BAR_HEIGHT, 'плашка — полная «таблетка»');
assert.ok(BAR_INSET > 0, 'кнопка не должна вылезать за плашку (раньше торчала выше неё)');

// таймер центрируется по высоте плашки (целый отступ сверху и снизу, без полупикселей)
assert.ok(TIMER_PILL_HEIGHT < BAR_HEIGHT);
assert.equal((BAR_HEIGHT - TIMER_PILL_HEIGHT) % 2, 0);

// рейл камеры стоит ровно над кнопкой отправки: одинаковая ширина колонки и центры на одной вертикали
assert.equal(RAIL_WIDTH, SEND_BUTTON_SIZE);
assert.equal(rightCenterOffset(RAIL_WIDTH), rightCenterOffset(SEND_BUTTON_SIZE));
// кнопка камеры не шире своей колонки
assert.ok(FLIP_BUTTON_SIZE <= RAIL_WIDTH);

// rightCenterOffset
assert.equal(rightCenterOffset(52), 26);
assert.equal(rightCenterOffset(52, 4), 30);

console.log('videoNoteRecorderLayout.test.ts: ok');

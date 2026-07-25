import assert from 'node:assert/strict';
import {
  formatChatDayLabel,
  shouldShowChatDaySeparator,
} from './formatChatDayLabel';

function testLabelsTodayAndYesterday() {
  const now = new Date(2026, 6, 15, 18, 0, 0).getTime();
  assert.equal(formatChatDayLabel(new Date(2026, 6, 15, 9, 0, 0).getTime(), now), 'Сегодня');
  assert.equal(formatChatDayLabel(new Date(2026, 6, 14, 21, 0, 0).getTime(), now), 'Вчера');
}

function testShowsSeparatorOnFirstMessageOfDay() {
  const yesterday = new Date(2026, 6, 14, 20, 0, 0).getTime();
  const todayMorning = new Date(2026, 6, 15, 9, 0, 0).getTime();
  const todayAfternoon = new Date(2026, 6, 15, 18, 0, 0).getTime();

  assert.equal(shouldShowChatDaySeparator(todayAfternoon, todayMorning), false);
  assert.equal(shouldShowChatDaySeparator(todayMorning, yesterday), true);
  assert.equal(shouldShowChatDaySeparator(todayAfternoon, yesterday), true);
  assert.equal(shouldShowChatDaySeparator(todayAfternoon, null), true);
}

testLabelsTodayAndYesterday();
testShowsSeparatorOnFirstMessageOfDay();
console.log('formatChatDayLabel.test.ts: ok');

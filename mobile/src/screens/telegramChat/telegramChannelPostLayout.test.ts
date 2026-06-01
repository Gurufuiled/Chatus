/**
 * Unit tests for Telegram channel post media clamp width.
 * Run: npx tsx src/screens/telegramChat/telegramChannelPostLayout.test.ts
 */

import { TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH } from '../../presentation/telegramChatFeedMetrics';
import { computeTelegramChannelPostMediaMaxWidth } from './telegramChannelPostLayout';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function runTests(): void {
  const w400 = computeTelegramChannelPostMediaMaxWidth({
    screenWidth: 400,
    telegramSelectionMode: false,
  });
  assert(w400 === 344, `expected 344 for 400px screen, got ${w400}`);

  const w400Sel = computeTelegramChannelPostMediaMaxWidth({
    screenWidth: 400,
    telegramSelectionMode: true,
  });
  assert(
    w400 - w400Sel === TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH,
    `selection should shrink by checkbox width: ${w400} -> ${w400Sel}`,
  );

  const narrow = computeTelegramChannelPostMediaMaxWidth({
    screenWidth: 200,
    telegramSelectionMode: true,
  });
  assert(narrow === 180, `floor should not go below 180, got ${narrow}`);
}

runTests();
console.log('telegramChannelPostLayout.test.ts OK');

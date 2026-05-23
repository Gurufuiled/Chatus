/**
 * Unit tests for Telegram dialog row fallback when refresh fails per-chat.
 * Run: npx tsx src/screens/telegramChat/telegramDialogFallback.test.ts
 */

import { buildChatRowLoadFailure, normalizeTelegramDialogRow } from './telegramDialogFallback';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function runTests(): void {
  const bare = buildChatRowLoadFailure(-5, undefined);
  assert(bare.chatId === '-5', 'chatId string');
  assert(bare.title === 'Чат -5', 'no previous title');

  const fromPrev = buildChatRowLoadFailure(99, {
    id: '99',
    chatId: '99',
    title: 'Канал новостей',
    lastMessagePreview: 'Привет',
    avatarUri: 'file:///x.png',
    lastMessageAt: 1000,
    unreadCount: 3,
    chatType: 'channel',
    memberCount: 12000,
  });
  assert(fromPrev.title === 'Канал новостей', 'keep title');
  assert(fromPrev.lastMessagePreview === 'Привет', 'keep preview');
  assert(fromPrev.avatarUri === 'file:///x.png', 'keep avatar');
  assert(fromPrev.lastMessageAt === 1000, 'keep date');
  assert(fromPrev.unreadCount === 3, 'keep unread');
  assert(fromPrev.chatType === 'channel', 'keep chatType for badge');
  assert(fromPrev.memberCount === 12000, 'keep memberCount');

  const whitespaceTitle = buildChatRowLoadFailure(1, {
    id: '1',
    chatId: '1',
    title: '   ',
    lastMessagePreview: '',
  });
  assert(whitespaceTitle.title === 'Чат 1', 'blank trimmed title falls back');

  const noUnread = buildChatRowLoadFailure(2, {
    id: '2',
    chatId: '2',
    title: 'OK',
    lastMessagePreview: '',
  });
  assert(noUnread.unreadCount === 0, 'default unread 0');

  const broken = normalizeTelegramDialogRow({
    id: '7',
    chatId: '7',
    title: 'Test',
    lastMessagePreview: undefined as unknown as string,
    lastMessageThumbnailUris: [null, 'file:///a.jpg', 42] as unknown as string[],
    unreadCount: undefined as unknown as number,
  });
  assert(broken.lastMessagePreview === '', 'missing preview → empty string');
  assert(broken.lastMessageThumbnailUris?.length === 1, 'filter invalid thumb uris');
  assert(broken.unreadCount === 0, 'missing unread → 0');

  console.log('telegramDialogFallback: all tests passed');
}

runTests();

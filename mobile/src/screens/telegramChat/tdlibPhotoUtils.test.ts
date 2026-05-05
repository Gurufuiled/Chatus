/**
 * Unit tests for chat.photo file id resolution (TDLib shapes).
 * Run: npx tsx src/screens/telegramChat/tdlibPhotoUtils.test.ts
 */

import { getTdlibChatPhotoFileId } from './tdlibPhotoUtils';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function runTests(): void {
  assert(getTdlibChatPhotoFileId({}) === null, 'no photo -> null');

  assert(
    getTdlibChatPhotoFileId({
      photo: {
        '@type': 'chatPhoto',
        small: { '@type': 'file', id: 11 },
        big: { '@type': 'file', id: 22 },
      },
    }) === 22,
    'prefers big file id',
  );

  assert(
    getTdlibChatPhotoFileId({
      photo: {
        '@type': 'chatPhoto',
        small: { '@type': 'file', id: 7 },
      },
    }) === 7,
    'falls back to small when big missing',
  );

  assert(
    getTdlibChatPhotoFileId({
      photo: {
        '@type': 'chatPhoto',
        big: { '@type': 'file', id: 0 },
        small: { '@type': 'file', id: 5 },
      },
    }) === 0,
    'big id 0 is valid',
  );

  assert(
    getTdlibChatPhotoFileId({
      photo: { '@type': 'chatPhoto', small: {}, big: {} },
    }) === null,
    'missing numeric ids -> null',
  );

  console.log('tdlibPhotoUtils getTdlibChatPhotoFileId: all tests passed');
}

runTests();

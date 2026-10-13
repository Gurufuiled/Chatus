import assert from 'node:assert/strict';
import { telegramRowsToProfileBuckets } from './telegramProfileMedia';
import type { TelegramMessageRow } from './types';

const row = (messageId: number, extra: Partial<TelegramMessageRow>): TelegramMessageRow =>
  ({
    id: String(messageId),
    messageId,
    kind: 'image',
    text: '',
    outgoing: false,
    dateMs: 1_700_000_000_000 + messageId * 1000,
    status: 'sent',
    ...extra,
  }) as TelegramMessageRow;

// ── фото: плитка берёт миниатюру, просмотр — полный файл ──
{
  const { mediaItems } = telegramRowsToProfileBuckets(
    [
      row(1, {
        kind: 'image',
        mediaUri: 'file:///full.jpg',
        thumbnailUri: 'file:///thumb.jpg',
        width: 1280,
        height: 960,
        text: 'подпись',
      }),
    ],
    'Собеседник',
  );
  assert.equal(mediaItems.length, 1);
  assert.equal(mediaItems[0].kind, 'image');
  assert.equal(mediaItems[0].uri, 'file:///full.jpg', 'на весь экран — полный файл');
  assert.equal(mediaItems[0].previewUri, 'file:///thumb.jpg', 'в сетке — миниатюра (регрессия: декодировалось полное фото)');
  assert.equal(mediaItems[0].width, 1280, 'габариты нужны рамке закрытия свайпом');
  assert.equal(mediaItems[0].height, 960);
  assert.equal(mediaItems[0].caption, 'подпись');
}
// миниатюры ещё нет — как раньше, превью = имеющийся адрес (мини-превью или полный файл)
{
  const { mediaItems } = telegramRowsToProfileBuckets(
    [row(1, { kind: 'image', mediaUri: 'data:image/jpeg;base64,AAAA' })],
    'x',
  );
  assert.equal(mediaItems[0].previewUri, 'data:image/jpeg;base64,AAAA');
  assert.equal(mediaItems[0].uri, 'data:image/jpeg;base64,AAAA');
}
// вообще ничего — пустой адрес, не падает
{
  const { mediaItems } = telegramRowsToProfileBuckets([row(1, { kind: 'image' })], 'x');
  assert.equal(mediaItems[0].uri, '');
  assert.equal(mediaItems[0].previewUri, undefined);
}

// ── видео: превью — миниатюра, uri пустой, пока не скачано ──
{
  const { mediaItems } = telegramRowsToProfileBuckets(
    [row(1, { kind: 'video', thumbnailUri: 'file:///vt.jpg', durationMs: 12_000, width: 1920, height: 1080 })],
    'x',
  );
  assert.equal(mediaItems[0].kind, 'video');
  assert.equal(mediaItems[0].uri, '');
  assert.equal(mediaItems[0].previewUri, 'file:///vt.jpg');
  assert.equal(mediaItems[0].durationMs, 12_000);
  assert.equal(mediaItems[0].width, 1920);
  assert.equal(mediaItems[0].height, 1080);
}

// ── остальные вкладки не пострадали ──
{
  const { mediaItems, fileItems, voiceItems, linkItems } = telegramRowsToProfileBuckets(
    [
      row(1, { kind: 'file', fileName: 'report.pdf', fileSize: 3 * 1024 * 1024 }),
      row(2, { kind: 'voice', voiceUri: 'file:///v.ogg', durationMs: 5000 }),
      row(3, { kind: 'video_note', mediaUri: 'file:///n.mp4', thumbnailUri: 'file:///nt.jpg', durationMs: 7000 }),
      row(4, { kind: 'text', text: 'смотри https://example.com/a и http://b.org' }),
    ],
    'Маша',
  );
  assert.equal(mediaItems.length, 0);
  assert.equal(fileItems[0].extension, 'PDF');
  assert.match(fileItems[0].subtitle, /^3\.0 МБ • /, 'размер файла форматируется общей функцией');
  assert.equal(voiceItems.length, 2);
  assert.equal(voiceItems[0].kind, 'voice');
  assert.equal(voiceItems[0].title, 'Маша');
  assert.equal(voiceItems[1].kind, 'video_note');
  assert.equal(voiceItems[1].thumbnailUri, 'file:///nt.jpg');
  assert.deepEqual(
    linkItems.map((l) => l.uri),
    ['https://example.com/a', 'http://b.org'],
  );
}

console.log('telegramProfileMedia.test.ts: ok');

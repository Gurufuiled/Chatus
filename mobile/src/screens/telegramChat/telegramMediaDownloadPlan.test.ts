import assert from 'node:assert/strict';
import {
  AUTO_DOWNLOAD_VIDEO_MAX_BYTES,
  NEWEST_ROWS,
  OLDER_ROWS,
  PRIORITY_NEWEST,
  PRIORITY_OLDER,
  PRIORITY_OLDEST,
  PRIORITY_RECENT,
  PRIORITY_USER_REQUEST,
  RECENT_ROWS,
  documentPriority,
  planMediaDownloads,
  planProfileMediaDownloads,
  planProfileViewerDownloads,
  recencyPriority,
  shouldAutoDownloadVideo,
  videoNotePriority,
  videoPriority,
  voicePriority,
} from './telegramMediaDownloadPlan';
import type { TelegramMessageRow } from './types';

const MB = 1024 * 1024;

const row = (messageId: number, extra: Partial<TelegramMessageRow> = {}): TelegramMessageRow =>
  ({
    id: String(messageId),
    messageId,
    kind: 'image',
    text: '',
    outgoing: false,
    dateMs: messageId * 1000,
    status: 'sent',
    ...extra,
  }) as TelegramMessageRow;

const priorityOf = (plan: ReturnType<typeof planMediaDownloads>, fileId: number) =>
  plan.find((r) => r.fileId === fileId)?.priority;

// ── recencyPriority: ступени по месту от конца чата ──
assert.equal(recencyPriority(0), PRIORITY_NEWEST);
assert.equal(recencyPriority(NEWEST_ROWS - 1), PRIORITY_NEWEST);
assert.equal(recencyPriority(NEWEST_ROWS), PRIORITY_RECENT);
assert.equal(recencyPriority(RECENT_ROWS - 1), PRIORITY_RECENT);
assert.equal(recencyPriority(RECENT_ROWS), PRIORITY_OLDER);
assert.equal(recencyPriority(OLDER_ROWS - 1), PRIORITY_OLDER);
assert.equal(recencyPriority(OLDER_ROWS), PRIORITY_OLDEST);
assert.equal(recencyPriority(10_000), PRIORITY_OLDEST);
// приоритеты TDLib в допустимых пределах 1…32 и убывают
for (const p of [PRIORITY_NEWEST, PRIORITY_RECENT, PRIORITY_OLDER, PRIORITY_OLDEST]) {
  assert.ok(p >= 1 && p <= 32);
}
assert.ok(PRIORITY_NEWEST > PRIORITY_RECENT && PRIORITY_RECENT > PRIORITY_OLDER && PRIORITY_OLDER > PRIORITY_OLDEST);

// ── тяжёлое ниже лёгкого на любой ступени ──
for (const tier of [PRIORITY_NEWEST, PRIORITY_RECENT, PRIORITY_OLDER, PRIORITY_OLDEST]) {
  assert.ok(videoPriority(tier) < tier, 'видео ниже фото');
  assert.ok(documentPriority(tier) <= videoPriority(tier), 'документ не выше видео');
  assert.ok(videoNotePriority(tier) <= tier, 'кружок не выше фото');
  assert.ok(videoPriority(tier) >= 1 && documentPriority(tier) >= 1, 'не ниже минимального приоритета TDLib');
}
assert.equal(videoPriority(PRIORITY_NEWEST), 8);
assert.equal(documentPriority(PRIORITY_NEWEST), 4);
assert.equal(documentPriority(1), 1);

// ── регрессия: свежее фото важнее старого, независимо от порядка строк на входе ──
{
  const rows = Array.from({ length: 40 }, (_, i) => row(i + 1, { mediaFullFileId: 1000 + i + 1 }));
  for (const input of [rows, [...rows].reverse()]) {
    const plan = planMediaDownloads(input);
    assert.equal(priorityOf(plan, 1040), PRIORITY_NEWEST, 'самое свежее');
    assert.equal(priorityOf(plan, 1035), PRIORITY_NEWEST, 'шестое с конца');
    assert.equal(priorityOf(plan, 1034), PRIORITY_RECENT);
    assert.equal(priorityOf(plan, 1021), PRIORITY_RECENT, 'двадцатое с конца — ещё «недавнее»');
    assert.equal(priorityOf(plan, 1020), PRIORITY_OLDER, 'двадцать первое с конца — «старее»');
    assert.equal(priorityOf(plan, 1001), PRIORITY_OLDER, 'самое старое из сорока — ещё в ступени 20…50');
  }
}
// очень старое — на нижней ступени
{
  const rows = Array.from({ length: 80 }, (_, i) => row(i + 1, { mediaFullFileId: 2000 + i + 1 }));
  const plan = planMediaDownloads(rows);
  assert.equal(priorityOf(plan, 2001), PRIORITY_OLDEST);
}

// ── порядок результата: от важного к менее важному, внутри ступени — свежее раньше ──
{
  const rows = [row(1, { mediaFullFileId: 11 }), row(2, { mediaFullFileId: 12 }), row(3, { mediaFullFileId: 13 })];
  const plan = planMediaDownloads(rows);
  assert.deepEqual(
    plan.map((r) => r.fileId),
    [13, 12, 11],
  );
  for (let i = 1; i < plan.length; i += 1) assert.ok(plan[i - 1].priority >= plan[i].priority);
}

// ── регрессия: голосовое не получает максимум независимо от возраста ──
{
  const rows = [
    ...Array.from({ length: 60 }, (_, i) => row(100 + i, { kind: 'image', mediaFullFileId: 3000 + i })),
    row(1, { kind: 'voice', mediaFullFileId: 9999 }), // самое старое
  ];
  const plan = planMediaDownloads(rows);
  assert.equal(priorityOf(plan, 9999), PRIORITY_OLDEST, 'старое голосовое не опережает видимые фото');
  assert.equal(priorityOf(plan, 3000 + 59), PRIORITY_NEWEST);
}
// свежее голосовое — важное
assert.equal(
  priorityOf(planMediaDownloads([row(5, { kind: 'voice', mediaFullFileId: 55 })]), 55),
  PRIORITY_NEWEST,
);

// ── виды медиа ──
{
  const plan = planMediaDownloads([
    row(1, {
      kind: 'video',
      mediaFullFileId: 21,
      mediaFullFileSize: 2 * MB,
      thumbnailFileId: 22,
    }),
  ]);
  assert.equal(priorityOf(plan, 22), PRIORITY_NEWEST, 'превью видео — сразу');
  assert.equal(priorityOf(plan, 21), videoPriority(PRIORITY_NEWEST), 'сам видеофайл — ниже');
}
{
  const plan = planMediaDownloads([row(1, { kind: 'video_note', mediaFullFileId: 31, thumbnailFileId: 32 })]);
  assert.equal(priorityOf(plan, 32), PRIORITY_NEWEST);
  assert.equal(priorityOf(plan, 31), videoNotePriority(PRIORITY_NEWEST));
}
{
  const plan = planMediaDownloads([row(1, { kind: 'file', mediaFullFileId: 41 })]);
  assert.equal(priorityOf(plan, 41), documentPriority(PRIORITY_NEWEST), 'документ — самый низкий');
}
{
  // аватары, превью ссылок, пересланное
  const plan = planMediaDownloads([
    row(1, {
      kind: 'text',
      webPagePreview: { url: 'https://x', photoFileId: 51 },
      forwardInfo: { avatarFileId: 52 } as TelegramMessageRow['forwardInfo'],
      senderAvatarFileId: 53,
    }),
  ]);
  assert.equal(priorityOf(plan, 51), PRIORITY_NEWEST);
  assert.equal(priorityOf(plan, 52), PRIORITY_NEWEST);
  assert.equal(priorityOf(plan, 53), PRIORITY_NEWEST);
}
{
  // альбом: фото — по ступени, видео-плитка — ниже, превью — сразу
  const plan = planMediaDownloads([
    row(1, {
      kind: 'album',
      albumMedia: [
        { messageId: 1, kind: 'image', mediaFullFileId: 61 },
        { messageId: 2, kind: 'video', mediaFullFileId: 62, mediaFullFileSize: MB, thumbnailFileId: 63 },
      ],
    }),
  ]);
  assert.equal(priorityOf(plan, 61), PRIORITY_NEWEST);
  assert.equal(priorityOf(plan, 62), videoPriority(PRIORITY_NEWEST));
  assert.equal(priorityOf(plan, 63), PRIORITY_NEWEST);
}

// ── автозагрузка видео только до порога (регрессия: целиком качались все видео, даже на сотни МБ) ──
assert.equal(shouldAutoDownloadVideo(1), true);
assert.equal(shouldAutoDownloadVideo(AUTO_DOWNLOAD_VIDEO_MAX_BYTES), true, 'ровно порог — ещё качаем');
assert.equal(shouldAutoDownloadVideo(AUTO_DOWNLOAD_VIDEO_MAX_BYTES + 1), false);
assert.equal(shouldAutoDownloadVideo(300 * MB), false);
assert.equal(shouldAutoDownloadVideo(undefined), false, 'размер неизвестен — ждём нажатия');
assert.equal(shouldAutoDownloadVideo(null), false);
assert.equal(shouldAutoDownloadVideo(0), false, 'TDLib отдаёт 0, когда размер неизвестен');
{
  const big = planMediaDownloads([
    row(1, { kind: 'video', mediaFullFileId: 81, mediaFullFileSize: 120 * MB, thumbnailFileId: 82 }),
  ]);
  assert.equal(priorityOf(big, 81), undefined, 'большое видео само не качается');
  assert.equal(priorityOf(big, 82), PRIORITY_NEWEST, 'а его превью — качается');

  const unknown = planMediaDownloads([row(1, { kind: 'video', mediaFullFileId: 83 })]);
  assert.equal(priorityOf(unknown, 83), undefined, 'без размера — тоже по нажатию');

  // кружок — всегда сам, размер не важен
  const note = planMediaDownloads([row(1, { kind: 'video_note', mediaFullFileId: 84, mediaFullFileSize: 99 * MB })]);
  assert.equal(priorityOf(note, 84), videoNotePriority(PRIORITY_NEWEST));

  // альбом: большая видео-плитка пропущена, фото и маленькое видео — нет
  const album = planMediaDownloads([
    row(1, {
      kind: 'album',
      albumMedia: [
        { messageId: 1, kind: 'image', mediaFullFileId: 85 },
        { messageId: 2, kind: 'video', mediaFullFileId: 86, mediaFullFileSize: 80 * MB, thumbnailFileId: 87 },
        { messageId: 3, kind: 'video', mediaFullFileId: 88, mediaFullFileSize: 3 * MB },
      ],
    }),
  ]);
  assert.equal(priorityOf(album, 85), PRIORITY_NEWEST);
  assert.equal(priorityOf(album, 86), undefined);
  assert.equal(priorityOf(album, 87), PRIORITY_NEWEST);
  assert.equal(priorityOf(album, 88), videoPriority(PRIORITY_NEWEST));
}

// ── профиль чата: только то, что видно в списках ──
{
  const rows = [
    row(1, { kind: 'image', mediaFullFileId: 101, thumbnailFileId: 102 }),
    row(2, { kind: 'video', mediaFullFileId: 103, mediaFullFileSize: MB, thumbnailFileId: 104 }),
    row(3, { kind: 'video_note', mediaFullFileId: 105, thumbnailFileId: 106 }),
    row(4, { kind: 'voice', mediaFullFileId: 107 }),
    row(5, { kind: 'file', mediaFullFileId: 108 }),
    row(6, { kind: 'text', thumbnailFileId: 109 }),
  ];
  const plan = planProfileMediaDownloads(rows);
  const ids = plan.map((r) => r.fileId).sort((a, b) => a - b);
  assert.deepEqual(ids, [102, 104, 106, 107], 'миниатюры плиток/кружков и голосовые; полные файлы и документы — нет');
  assert.equal(priorityOf(plan, 104), PRIORITY_NEWEST, 'миниатюры самых свежих — сразу');
  assert.equal(priorityOf(plan, 107), voicePriority(PRIORITY_NEWEST));
  assert.ok(voicePriority(PRIORITY_NEWEST) < PRIORITY_NEWEST, 'голосовые ниже миниатюр');
  assert.deepEqual(planProfileMediaDownloads([]), []);
}
{
  // миниатюры свежих плиток важнее старых (сетка показывает новые сверху)
  const rows = Array.from({ length: 80 }, (_, i) => row(i + 1, { kind: 'image', thumbnailFileId: 5000 + i + 1 }));
  const plan = planProfileMediaDownloads(rows);
  assert.equal(priorityOf(plan, 5080), PRIORITY_NEWEST);
  assert.equal(priorityOf(plan, 5001), PRIORITY_OLDEST);
  assert.equal(plan.length, 80);
}

// ── открытие медиа в профиле ──
{
  const rows = [
    row(5, { kind: 'image', mediaFullFileId: 201 }),
    row(4, { kind: 'text' }), // не плитка — в нумерации не участвует
    row(3, { kind: 'video', mediaFullFileId: 202, mediaFullFileSize: 90 * MB }),
    row(2, { kind: 'image', mediaFullFileId: 203 }),
    row(1, { kind: 'image', mediaFullFileId: 204 }),
  ];
  // открыто видео (индекс плитки 1): оно — с высшим приоритетом; соседние фото — ниже
  const video = planProfileViewerDownloads(rows, 1);
  assert.equal(priorityOf(video, 202), PRIORITY_USER_REQUEST);
  assert.equal(priorityOf(video, 201), PRIORITY_RECENT);
  assert.equal(priorityOf(video, 203), PRIORITY_RECENT);
  assert.equal(priorityOf(video, 204), undefined, 'дальше соседних не качаем');

  // открыто фото между видео и фото: соседнее видео не качаем
  const photo = planProfileViewerDownloads(rows, 2);
  assert.equal(priorityOf(photo, 203), PRIORITY_USER_REQUEST);
  assert.equal(priorityOf(photo, 204), PRIORITY_RECENT);
  assert.equal(priorityOf(photo, 202), undefined, 'соседнее видео — тяжёлое, само не качается');

  // уже скачанное (нет mediaFullFileId) — нечего качать
  assert.deepEqual(planProfileViewerDownloads([row(1, { kind: 'image', mediaUri: 'file:///a.jpg' })], 0), []);
  // индекс вне списка
  assert.deepEqual(planProfileViewerDownloads(rows, 99), []);
  assert.deepEqual(planProfileViewerDownloads(rows, -1), []);
}
assert.equal(PRIORITY_USER_REQUEST, 32);
assert.ok(PRIORITY_USER_REQUEST > PRIORITY_RECENT);

// ── дубликаты и пустые значения ──
{
  // один файл в двух строках (например, одно превью) → берётся наибольший приоритет, в плане один раз
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => row(100 + i, { mediaFullFileId: 7000 + i })),
    row(1, { mediaFullFileId: 777 }),
    row(200, { mediaFullFileId: 777 }),
  ];
  const plan = planMediaDownloads(rows);
  assert.equal(plan.filter((r) => r.fileId === 777).length, 1);
  assert.equal(priorityOf(plan, 777), PRIORITY_NEWEST);
}
assert.deepEqual(planMediaDownloads([]), []);
assert.deepEqual(planMediaDownloads([row(1), row(2, { kind: 'text' })]), [], 'нет файлов — нет загрузок');

// ── вход не мутируется ──
{
  const rows = [row(2, { mediaFullFileId: 2 }), row(1, { mediaFullFileId: 1 })];
  const copy = [...rows];
  planMediaDownloads(rows);
  assert.deepEqual(rows, copy);
}
// одинаковая дата — свежее по messageId
{
  const rows = [
    row(1, { dateMs: 5000, mediaFullFileId: 1 }),
    row(2, { dateMs: 5000, mediaFullFileId: 2 }),
  ];
  assert.deepEqual(planMediaDownloads(rows).map((r) => r.fileId), [2, 1]);
}

console.log('telegramMediaDownloadPlan.test.ts: ok');

import assert from 'node:assert/strict';
import {
  CHAT_PHOTO_TARGET_SIDE,
  GRID_PHOTO_TARGET_SIDE,
  pickDisplayPhotoSize,
  planGridPhoto,
  planPhotoDisplay,
  type PhotoSizeCandidate,
} from './tdlibPhotoSize';

const size = (
  side: number,
  fileId: number | null,
  localUri: string | null = null,
  ratio = 0.75,
): PhotoSizeCandidate => ({
  width: side,
  height: Math.round(side * ratio),
  fileId,
  localUri,
});

// типичный набор TDLib: s(90), m(320), x(800), y(1280), w(2560)
const s90 = size(90, 1);
const m320 = size(320, 2);
const x800 = size(800, 3);
const y1280 = size(1280, 4);
const w2560 = size(2560, 5);
const all = [s90, m320, x800, y1280, w2560];

// ── pickDisplayPhotoSize ──
assert.equal(CHAT_PHOTO_TARGET_SIDE, 1280);
assert.equal(pickDisplayPhotoSize(all), y1280, 'не 2560, а наименьший от 1280');
assert.equal(pickDisplayPhotoSize([s90, m320, x800]), x800, 'если нет ≥1280 — самый большой из имеющихся');
assert.equal(pickDisplayPhotoSize([m320]), m320);
assert.equal(pickDisplayPhotoSize([]), null);
assert.equal(pickDisplayPhotoSize([w2560, s90, y1280, x800, m320]), y1280, 'порядок во входе не важен');
assert.equal(pickDisplayPhotoSize([size(1000, 1), size(1600, 2), size(2560, 3)])!.fileId, 2, 'между 1600 и 2560 — меньший');

// портрет: учитывается большая сторона (высота), а не ширина
const portrait = [size(100, 1, null, 2), size(640, 2, null, 2), size(1280, 3, null, 2)];
assert.equal(pickDisplayPhotoSize(portrait, 1280)!.fileId, 2, 'у второго высота 1280 — достаточно');

// размеры без габаритов не участвуют; если известных нет совсем — последний
const unknown = [
  { width: 0, height: 0, id: 'a' },
  { width: 0, height: 0, id: 'b' },
];
assert.equal(pickDisplayPhotoSize(unknown), unknown[1]);
assert.equal(
  pickDisplayPhotoSize([
    { width: 0, height: 0, id: 'a' },
    { width: 500, height: 400, id: 'b' },
  ])!.id,
  'b',
);

// другая цель
assert.equal(pickDisplayPhotoSize(all, 700), x800);
assert.equal(pickDisplayPhotoSize(all, 4000), w2560, 'цель выше всех — самый большой');

// ── planPhotoDisplay: ничего не скачано ──
{
  const plan = planPhotoDisplay(all, false);
  assert.equal(plan.display, y1280);
  assert.equal(plan.show, null, 'пока ничего локально — остаётся мини-превью');
  assert.equal(plan.pendingFileId, 4, 'ждём файл 1280, а не 2560');
  assert.equal(plan.shouldScheduleDownload, true);
}
// локальный режим: докачку не ставим, но файл запоминаем для экрана
{
  const plan = planPhotoDisplay(all, true);
  assert.equal(plan.pendingFileId, 4);
  assert.equal(plan.shouldScheduleDownload, false);
}

// ── уже скачан нужный размер → докачивать нечего ──
{
  const local = [s90, m320, x800, size(1280, 4, 'file:///y.jpg'), w2560];
  const plan = planPhotoDisplay(local, false);
  assert.equal(plan.show?.uri, 'file:///y.jpg');
  assert.equal(plan.pendingFileId, null);
  assert.equal(plan.shouldScheduleDownload, false);
}

// ── скачан БОЛЬШИЙ размер (смотрели оригинал) → показываем его, ничего не докачиваем ──
{
  const local = [s90, m320, x800, y1280, size(2560, 5, 'file:///w.jpg')];
  const plan = planPhotoDisplay(local, false);
  assert.equal(plan.show?.uri, 'file:///w.jpg');
  assert.equal(plan.pendingFileId, null, 'оригинал уже есть — зачем качать 1280');
  assert.equal(plan.shouldScheduleDownload, false);
}

// ── скачан только маленький → показываем как превью и докачиваем целевой ──
{
  const local = [size(90, 1, 'file:///s.jpg'), m320, x800, y1280, w2560];
  const plan = planPhotoDisplay(local, false);
  assert.equal(plan.show?.uri, 'file:///s.jpg');
  assert.equal(plan.pendingFileId, 4);
  assert.equal(plan.shouldScheduleDownload, true);
}
// то же в локальном режиме — путь обновления сохраняется (pendingFileId), хотя сама докачка не ставится
{
  const local = [size(320, 2, 'file:///m.jpg'), s90, x800, y1280, w2560];
  const plan = planPhotoDisplay(local, true);
  assert.equal(plan.show?.uri, 'file:///m.jpg');
  assert.equal(plan.pendingFileId, 4, 'регрессия: при mediaLocalOnly превью раньше оставалось навсегда без пути обновления');
  assert.equal(plan.shouldScheduleDownload, false);
}
// из нескольких скачанных малых берётся самый крупный
{
  const local = [size(90, 1, 'file:///s.jpg'), size(320, 2, 'file:///m.jpg'), x800, y1280, w2560];
  assert.equal(planPhotoDisplay(local, false).show?.uri, 'file:///m.jpg');
}

// ── фото мельче цели (нет 1280): «полный» = самый большой имеющийся ──
{
  const small = [s90, m320, size(800, 3)];
  const plan = planPhotoDisplay(small, false);
  assert.equal(plan.display!.fileId, 3);
  assert.equal(plan.pendingFileId, 3);
  const done = planPhotoDisplay([s90, m320, size(800, 3, 'file:///x.jpg')], false);
  assert.equal(done.pendingFileId, null);
  assert.equal(done.show?.uri, 'file:///x.jpg');
}

// ── граничные случаи ──
assert.deepEqual(planPhotoDisplay([], false), {
  display: null,
  show: null,
  pendingFileId: null,
  shouldScheduleDownload: false,
});
{
  // у файла нет id — докачивать нечего
  const plan = planPhotoDisplay([size(1280, null)], false);
  assert.equal(plan.pendingFileId, null);
  assert.equal(plan.shouldScheduleDownload, false);
}
{
  // габариты неизвестны: показываем локальный файл
  const plan = planPhotoDisplay([{ width: 0, height: 0, fileId: 7, localUri: 'file:///n.jpg' }], false);
  assert.equal(plan.show?.uri, 'file:///n.jpg');
  assert.equal(plan.pendingFileId, null);
}

// ── planGridPhoto: миниатюра плитки профиля (~320 px), а не фото на всю ленту ──
assert.equal(GRID_PHOTO_TARGET_SIDE, 320);
{
  const plan = planGridPhoto(all);
  assert.equal(plan.show, null);
  assert.equal(plan.pendingFileId, 2, 'качаем размер m (320), а не 1280/2560');
}
{
  // миниатюра уже скачана
  const plan = planGridPhoto([s90, size(320, 2, 'file:///m.jpg'), x800, y1280, w2560]);
  assert.equal(plan.show?.uri, 'file:///m.jpg');
  assert.equal(plan.pendingFileId, null);
}
{
  // скачан только более крупный размер (смотрели фото) — берём наименьший из крупных, миниатюру не качаем
  const plan = planGridPhoto([s90, m320, size(800, 3, 'file:///x.jpg'), size(1280, 4, 'file:///y.jpg'), w2560]);
  assert.equal(plan.show?.uri, 'file:///x.jpg', 'наименьший из скачанных, что не меньше миниатюры');
  assert.equal(plan.pendingFileId, null);
}
{
  // скачан только меньший размер: показываем его, пока грузится миниатюра
  const plan = planGridPhoto([size(90, 1, 'file:///s.jpg'), m320, x800]);
  assert.equal(plan.show?.uri, 'file:///s.jpg');
  assert.equal(plan.pendingFileId, 2);
}
{
  // фото мельче цели: «миниатюра» — самый большой имеющийся
  const plan = planGridPhoto([s90, size(200, 2)]);
  assert.equal(plan.pendingFileId, 2);
}
assert.deepEqual(planGridPhoto([]), { show: null, pendingFileId: null });
assert.equal(planGridPhoto([size(320, null)]).pendingFileId, null, 'у файла нет id — докачивать нечего');
{
  // портрет: учитывается большая сторона
  const plan = planGridPhoto([size(100, 1, null, 2), size(160, 2, null, 2), size(640, 3, null, 2)]);
  assert.equal(plan.pendingFileId, 2, 'у второго высота 320');
}

console.log('tdlibPhotoSize.test.ts: ok');

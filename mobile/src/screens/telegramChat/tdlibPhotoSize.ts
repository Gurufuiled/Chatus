/**
 * Выбор размера фото для показа в ленте Telegram-чата. Чистая логика без native TDLib — покрыта
 * тестами в `tdlibPhotoSize.test.ts`.
 *
 * Раньше для КАЖДОГО фото в ленте скачивался самый большой размер (до 2560 px, несколько МБ). Telegram
 * показывает в ленте ~1280 (размер `x`), а оригинал скачивает только при открытии. Отсюда медленная
 * прогрузка медиа в Telegram-аккаунте.
 */

/** Целевая большая сторона фото в пузыре чата, px. */
export const CHAT_PHOTO_TARGET_SIDE = 1280;

export type PhotoSizeCandidate = {
  width: number;
  height: number;
  fileId: number | null;
  /** `file://…`, если файл этого размера уже скачан. */
  localUri: string | null;
};

function longSide(size: { width: number; height: number }): number {
  return Math.max(size.width > 0 ? size.width : 0, size.height > 0 ? size.height : 0);
}

/**
 * Какой размер показывать в ленте: наименьший, у которого большая сторона ≥ `targetSide`; если таких нет
 * (фото мельче цели) — самый большой. Размеры без известных габаритов не участвуют, а если известных нет
 * совсем — берётся последний (TDLib отдаёт размеры по возрастанию).
 */
export function pickDisplayPhotoSize<T extends { width: number; height: number }>(
  sizes: readonly T[],
  targetSide: number = CHAT_PHOTO_TARGET_SIDE,
): T | null {
  if (sizes.length === 0) return null;
  const known = sizes.filter((s) => longSide(s) > 0);
  if (known.length === 0) return sizes[sizes.length - 1];

  const atOrAbove = known.filter((s) => longSide(s) >= targetSide);
  if (atOrAbove.length > 0) {
    return atOrAbove.reduce((best, s) => (longSide(s) < longSide(best) ? s : best));
  }
  return known.reduce((best, s) => (longSide(s) > longSide(best) ? s : best));
}

/** Целевая большая сторона миниатюры в сетке медиа профиля, px (плитка ~120 dp, с запасом под плотность). */
export const GRID_PHOTO_TARGET_SIDE = 320;

export type GridPhotoPlan = {
  /** Что показать в плитке из уже скачанного (`null` — ничего, останется мини-превью). */
  show: { uri: string; width: number; height: number } | null;
  /** Файл миниатюры, который надо докачать (иначе `null`). */
  pendingFileId: number | null;
};

/**
 * Миниатюра для сетки профиля: наименьший размер от `GRID_PHOTO_TARGET_SIDE` (а не фото на всю ленту, как
 * `planPhotoDisplay`). Если нужный размер ещё не скачан, но есть более крупный — показываем его и ничего не
 * докачиваем; иначе докачиваем только миниатюру.
 */
export function planGridPhoto(
  sizes: readonly PhotoSizeCandidate[],
  targetSide: number = GRID_PHOTO_TARGET_SIDE,
): GridPhotoPlan {
  const thumb = pickDisplayPhotoSize(sizes, targetSide);
  if (!thumb) return { show: null, pendingFileId: null };

  const thumbSide = longSide(thumb);
  const toShow = (s: PhotoSizeCandidate) => ({
    uri: s.localUri as string,
    width: s.width > 0 ? s.width : thumb.width,
    height: s.height > 0 ? s.height : thumb.height,
  });

  if (thumb.localUri) return { show: toShow(thumb), pendingFileId: null };

  // уже скачанный размер не меньше нужного: берём наименьший из них — докачка не нужна
  const larger = sizes
    .filter((s) => s.localUri && longSide(s) >= thumbSide)
    .sort((a, b) => longSide(a) - longSide(b))[0];
  if (larger) return { show: toShow(larger), pendingFileId: null };

  // скачан только меньший размер: показываем его, пока грузится миниатюра
  const smaller = sizes
    .filter((s) => s.localUri)
    .sort((a, b) => longSide(b) - longSide(a))[0];
  return { show: smaller ? toShow(smaller) : null, pendingFileId: thumb.fileId };
}

export type PhotoDisplayPlan = {
  /** Размер, который считаем «полным» для ленты (его файл ждём). */
  display: PhotoSizeCandidate | null;
  /** Что показать прямо сейчас из уже скачанного: `null` — ничего (останется мини-превью). */
  show: { uri: string; width: number; height: number } | null;
  /** Файл «полного» размера, который ещё надо докачать (иначе `null`). */
  pendingFileId: number | null;
  /** Ставить ли докачку в очередь прямо сейчас (в режиме «только локально» — нет). */
  shouldScheduleDownload: boolean;
};

/**
 * Решает, что показывать и что докачивать для одного фото.
 * - Показываем лучший из скачанных: если он не меньше целевого — докачивать нечего;
 *   если меньше — показываем его как превью и докачиваем целевой.
 * - Ничего не скачано — докачиваем целевой, пока показывается мини-превью.
 * - `mediaLocalOnly`: докачку не ставим, но `pendingFileId` возвращаем, чтобы экран поставил её сам с нужным
 *   приоритетом (раньше низкокачественное локальное превью оставалось навсегда без пути к обновлению).
 */
export function planPhotoDisplay(
  sizes: readonly PhotoSizeCandidate[],
  mediaLocalOnly: boolean,
  targetSide: number = CHAT_PHOTO_TARGET_SIDE,
): PhotoDisplayPlan {
  const display = pickDisplayPhotoSize(sizes, targetSide);
  if (!display) {
    return { display: null, show: null, pendingFileId: null, shouldScheduleDownload: false };
  }

  const displaySide = longSide(display);
  // скачанные размеры от большего к меньшему
  const local = sizes.filter((s) => s.localUri).sort((a, b) => longSide(b) - longSide(a));
  const best = local[0] ?? null;

  const toShow = (s: PhotoSizeCandidate) => ({
    uri: s.localUri as string,
    width: s.width > 0 ? s.width : display.width,
    height: s.height > 0 ? s.height : display.height,
  });

  if (best && (best === display || longSide(best) >= displaySide)) {
    return { display, show: toShow(best), pendingFileId: null, shouldScheduleDownload: false };
  }

  const pendingFileId = display.fileId;
  return {
    display,
    show: best ? toShow(best) : null,
    pendingFileId,
    shouldScheduleDownload: pendingFileId != null && !mediaLocalOnly,
  };
}

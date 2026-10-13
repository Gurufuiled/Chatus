/**
 * План приоритетов загрузки медиа в Telegram-чате. Чистая логика (только типы) — покрыта тестами
 * в `telegramMediaDownloadPlan.test.ts`.
 *
 * Было: все ожидающие файлы ставились в очередь TDLib с одним приоритетом в порядке сообщений, а голосовые —
 * с максимальным независимо от возраста. Видимые (самые свежие) фото ждали очереди за старыми сообщениями,
 * голосовыми и чужими файлами. Теперь приоритет зависит от «свежести» сообщения (ближе к низу чата — выше),
 * а тяжёлое (видео целиком, документы) идёт с низким приоритетом и не мешает фото.
 *
 * Приоритеты TDLib: 1…32, больше — важнее.
 */
import type { TelegramMessageRow } from './types';

export type MediaDownloadRequest = { fileId: number; priority: number };

export const PRIORITY_NEWEST = 32;
export const PRIORITY_RECENT = 24;
export const PRIORITY_OLDER = 16;
export const PRIORITY_OLDEST = 8;

/** Сколько самых свежих сообщений считаем «на экране». */
export const NEWEST_ROWS = 6;
export const RECENT_ROWS = 20;
export const OLDER_ROWS = 50;

/** Приоритет для сообщения по его месту от конца чата (0 — самое свежее). */
export function recencyPriority(rank: number): number {
  if (rank < NEWEST_ROWS) return PRIORITY_NEWEST;
  if (rank < RECENT_ROWS) return PRIORITY_RECENT;
  if (rank < OLDER_ROWS) return PRIORITY_OLDER;
  return PRIORITY_OLDEST;
}

/**
 * Видео крупнее этого размера само не скачивается: на плашке кнопка «скачать» с размером, файл идёт по нажатию
 * (как в Telegram). Раньше каждое видео в последних сообщениях качалось целиком в фоне, даже на сотни МБ.
 */
export const AUTO_DOWNLOAD_VIDEO_MAX_BYTES = 10 * 1024 * 1024;

/** Приоритет загрузки по нажатию пользователя — выше любого фонового. */
export const PRIORITY_USER_REQUEST = 32;

/**
 * Качать ли видео автоматически. Неизвестный размер (нет данных от TDLib) считаем большим: лучше показать
 * кнопку, чем тихо потратить трафик.
 */
export function shouldAutoDownloadVideo(sizeBytes: number | null | undefined): boolean {
  return typeof sizeBytes === 'number' && sizeBytes > 0 && sizeBytes <= AUTO_DOWNLOAD_VIDEO_MAX_BYTES;
}

/** Целый видеофайл: заметно ниже фото, чтобы не занимать канал, пока грузятся картинки. */
export function videoPriority(tier: number): number {
  return Math.max(1, Math.floor(tier / 4));
}

/** Документ: ещё ниже. */
export function documentPriority(tier: number): number {
  return Math.max(1, Math.floor(tier / 8));
}

/** Видеокружок: небольшой файл, но не важнее картинок. */
export function videoNotePriority(tier: number): number {
  return Math.max(PRIORITY_OLDEST, tier - 8);
}

function compareNewestFirst(a: TelegramMessageRow, b: TelegramMessageRow): number {
  if (b.dateMs !== a.dateMs) return b.dateMs - a.dateMs;
  return b.messageId - a.messageId;
}

/** Копит запросы: один файл — один запрос с наибольшим приоритетом, итог по убыванию приоритета. */
function createRequestCollector() {
  const byFile = new Map<number, number>();
  const order: number[] = [];
  return {
    put(fileId: number | null | undefined, priority: number) {
      if (fileId == null) return;
      const prev = byFile.get(fileId);
      if (prev == null) {
        byFile.set(fileId, priority);
        order.push(fileId);
      } else if (priority > prev) {
        byFile.set(fileId, priority);
      }
    },
    result(): MediaDownloadRequest[] {
      return order
        .map((fileId) => ({ fileId, priority: byFile.get(fileId) as number }))
        .sort((a, b) => b.priority - a.priority);
    },
  };
}

/** Голосовое: маленький файл, нужен для воспроизведения, но не важнее картинок. */
export function voicePriority(tier: number): number {
  return Math.max(1, Math.floor(tier / 2));
}

/**
 * Что докачивать для вкладок профиля чата: только то, что видно в списках. Миниатюры плиток медиа и кружков —
 * по «свежести» (сетка показывает новые сверху); голосовые — с низким приоритетом. Полные фото, видео и
 * документы НЕ качаются: их открывают по нажатию (`planProfileViewerDownloads`). Раньше профиль скачивал
 * полноразмерное фото для каждой плитки и целиком каждый документ из последних 400 сообщений.
 */
export function planProfileMediaDownloads(rows: readonly TelegramMessageRow[]): MediaDownloadRequest[] {
  const collector = createRequestCollector();
  const visible = rows.filter(
    (row) =>
      row.kind === 'image' ||
      row.kind === 'video' ||
      row.kind === 'video_note' ||
      row.kind === 'voice',
  );
  [...visible].sort(compareNewestFirst).forEach((row, rank) => {
    const tier = recencyPriority(rank);
    collector.put(row.thumbnailFileId, tier);
    if (row.kind === 'voice') collector.put(row.mediaFullFileId, voicePriority(tier));
  });
  return collector.result();
}

/**
 * Загрузки при открытии медиа в профиле: открытое — с высшим приоритетом, фото по соседству — чуть ниже, чтобы
 * листание было мгновенным. Соседние видео не трогаем (тяжёлые). `rows` — строки в порядке плиток сетки.
 */
export function planProfileViewerDownloads(
  rows: readonly TelegramMessageRow[],
  openedIndex: number,
): MediaDownloadRequest[] {
  const tiles = rows.filter((row) => row.kind === 'image' || row.kind === 'video');
  const collector = createRequestCollector();
  const opened = tiles[openedIndex];
  if (!opened) return [];
  collector.put(opened.mediaFullFileId, PRIORITY_USER_REQUEST);
  for (const neighbor of [tiles[openedIndex + 1], tiles[openedIndex - 1]]) {
    if (neighbor?.kind === 'image') collector.put(neighbor.mediaFullFileId, PRIORITY_RECENT);
  }
  return collector.result();
}

/**
 * Список файлов к загрузке с приоритетами. Порядок строк на входе не важен — «свежесть» считается по дате.
 * Один и тот же файл (если встретился несколько раз) получает наибольший приоритет.
 */
export function planMediaDownloads(rows: readonly TelegramMessageRow[]): MediaDownloadRequest[] {
  const collector = createRequestCollector();
  const put = collector.put;

  const sorted = [...rows].sort(compareNewestFirst);
  sorted.forEach((row, rank) => {
    const tier = recencyPriority(rank);

    // превью и аватары нужны сразу — они маленькие и показывают пузырь
    put(row.thumbnailFileId, tier);
    put(row.webPagePreview?.photoFileId, tier);
    put(row.forwardInfo?.avatarFileId, tier);
    put(row.senderAvatarFileId, tier);

    switch (row.kind) {
      case 'video':
        if (shouldAutoDownloadVideo(row.mediaFullFileSize)) {
          put(row.mediaFullFileId, videoPriority(tier));
        }
        break;
      case 'video_note':
        put(row.mediaFullFileId, videoNotePriority(tier));
        break;
      case 'file':
        put(row.mediaFullFileId, documentPriority(tier));
        break;
      default:
        // фото, голосовые и всё остальное, что показывается пузырём
        put(row.mediaFullFileId, tier);
    }

    if (row.kind === 'album') {
      for (const item of row.albumMedia ?? []) {
        put(item.thumbnailFileId, tier);
        if (item.kind === 'video') {
          if (shouldAutoDownloadVideo(item.mediaFullFileSize)) {
            put(item.mediaFullFileId, videoPriority(tier));
          }
        } else {
          put(item.mediaFullFileId, tier);
        }
      }
    }
  });

  return collector.result();
}

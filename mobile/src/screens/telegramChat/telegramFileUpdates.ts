import type { TelegramDialogRow } from '../../stores/telegramAccountStore';
import type { TelegramMessageRow } from './types';
import { getNestedRecord } from './tdlibMapping';
import { shouldAutoDownloadVideo } from './telegramMediaDownloadPlan';
import { setCachedUserAvatarUri } from '../../services/tdlib/userNameCache';

export function getTdlibFileLocalUri(file: Record<string, unknown> | null): string | null {
  const local = getNestedRecord(file?.local);
  if (local?.is_downloading_completed !== true) return null;
  const path = typeof local?.path === 'string' ? local.path.trim() : '';
  return path ? `file://${path}` : null;
}

export function getTdlibFileId(file: Record<string, unknown> | null): number | null {
  const id = file?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

/** Apply TDLib `updateFile` to media rows (voice/video/photo/web preview/album tile). */
export function patchMessagesWithTdlibFile(
  rows: TelegramMessageRow[],
  file: Record<string, unknown>,
): TelegramMessageRow[] {
  const fileId = getTdlibFileId(file);
  const uri = getTdlibFileLocalUri(file);
  if (fileId == null || !uri) return rows;

  let changed = false;
  const next = rows.map((row) => {
    let updated = row;

    if (row.mediaFullFileId === fileId) {
      changed = true;
      updated = {
        ...updated,
        mediaUri: uri,
        voiceUri: row.kind === 'voice' ? uri : updated.voiceUri,
        mediaFullFileId: undefined,
        mediaFullFileSize: undefined,
      };
    }

    if (row.thumbnailFileId === fileId) {
      changed = true;
      updated = {
        ...updated,
        thumbnailUri: uri,
        thumbnailFileId: undefined,
      };
    }

    const preview = row.webPagePreview;
    if (preview?.photoFileId === fileId) {
      changed = true;
      updated = {
        ...updated,
        webPagePreview: {
          ...preview,
          photoUri: uri,
          photoFileId: undefined,
        },
      };
    }

    const forward = row.forwardInfo;
    if (forward?.avatarFileId === fileId) {
      changed = true;
      updated = {
        ...updated,
        forwardInfo: {
          ...forward,
          avatarUri: uri,
          avatarFileId: undefined,
        },
      };
    }

    if (row.senderAvatarFileId === fileId) {
      changed = true;
      if (row.senderUserId != null) {
        setCachedUserAvatarUri(row.senderUserId, uri);
      }
      updated = {
        ...updated,
        senderAvatarUri: uri,
        senderAvatarFileId: undefined,
      };
    }

    if (row.kind === 'album' && row.albumMedia?.length) {
      let albumChanged = false;
      const albumMedia = row.albumMedia.map((item) => {
        if (item.mediaFullFileId === fileId) {
          albumChanged = true;
          return { ...item, mediaUri: uri, mediaFullFileId: undefined, mediaFullFileSize: undefined };
        }
        if (item.thumbnailFileId === fileId) {
          albumChanged = true;
          return { ...item, thumbnailUri: uri, thumbnailFileId: undefined };
        }
        return item;
      });
      if (albumChanged) {
        changed = true;
        updated = { ...updated, albumMedia };
      }
    }

    return updated;
  });

  return changed ? next : rows;
}

/**
 * Применить пачку `updateFile` одним проходом. Если ни одно обновление ничего не меняет, возвращается тот же
 * массив (React не перерисует чат).
 */
export function patchMessagesWithTdlibFiles(
  rows: TelegramMessageRow[],
  files: ReadonlyArray<Record<string, unknown>>,
): TelegramMessageRow[] {
  let current = rows;
  for (const file of files) {
    current = patchMessagesWithTdlibFile(current, file);
  }
  return current;
}

/** id файлов из пачки `updateFile`, которые скачаны полностью. */
export function completedTdlibFileIds(files: ReadonlyArray<Record<string, unknown>>): number[] {
  const ids: number[] = [];
  for (const file of files) {
    const id = getTdlibFileId(file);
    if (id != null && getNestedRecord(file.local)?.is_downloading_completed === true) {
      ids.push(id);
    }
  }
  return ids;
}

/** Apply TDLib `updateFile` to dialog list avatars. */
export function patchDialogsWithTdlibFile(
  dialogs: TelegramDialogRow[],
  file: Record<string, unknown>,
): TelegramDialogRow[] {
  const fileId = getTdlibFileId(file);
  const uri = getTdlibFileLocalUri(file);
  if (fileId == null || !uri) return dialogs;

  let changed = false;
  const next = dialogs.map((row) => {
    if (row.avatarFileId !== fileId) return row;
    changed = true;
    return {
      ...row,
      avatarUri: uri,
      avatarFileId: undefined,
    };
  });

  return changed ? next : dialogs;
}

/**
 * Пачка `updateFile` для списка диалогов. Тот же тождественный возврат, если ничего не изменилось.
 * (`patchDialogsWithTdlibFile` раньше нигде не вызывалась: аватарки в списке появлялись только после
 * следующего обновления списка.)
 */
export function patchDialogsWithTdlibFiles(
  dialogs: TelegramDialogRow[],
  files: ReadonlyArray<Record<string, unknown>>,
): TelegramDialogRow[] {
  let current = dialogs;
  for (const file of files) {
    current = patchDialogsWithTdlibFile(current, file);
  }
  return current;
}

export function collectPendingTdlibFileIds(rows: TelegramMessageRow[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    // TDLib downloads are asynchronous, so media keeps its thumbnail while the
    // full file is prefetched in the background. A direct tap can still raise
    // the same file to a higher priority.
    if (row.mediaFullFileId != null) {
      ids.add(row.mediaFullFileId);
    }
    if (row.thumbnailFileId != null) ids.add(row.thumbnailFileId);
    if (row.webPagePreview?.photoFileId != null) ids.add(row.webPagePreview.photoFileId);
    if (row.forwardInfo?.avatarFileId != null) ids.add(row.forwardInfo.avatarFileId);
    if (row.senderAvatarFileId != null) ids.add(row.senderAvatarFileId);
    if (row.kind === 'album') {
      for (const item of row.albumMedia ?? []) {
        if (item.mediaFullFileId != null) {
          ids.add(item.mediaFullFileId);
        }
        if (item.thumbnailFileId != null) ids.add(item.thumbnailFileId);
      }
    }
  }
  return [...ids];
}

/**
 * Видео, которые качаются сами (на плашке крутится индикатор). Большие видео сюда не попадают: они ждут
 * нажатия на кнопку «скачать» (см. `shouldAutoDownloadVideo`). Кружки — маленькие, качаются всегда.
 */
export function collectPendingTdlibVideoFileIds(rows: TelegramMessageRow[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.mediaFullFileId != null) {
      if (row.kind === 'video_note' || (row.kind === 'video' && shouldAutoDownloadVideo(row.mediaFullFileSize))) {
        ids.add(row.mediaFullFileId);
      }
    }
    if (row.kind === 'album') {
      for (const item of row.albumMedia ?? []) {
        if (
          item.kind === 'video' &&
          item.mediaFullFileId != null &&
          shouldAutoDownloadVideo(item.mediaFullFileSize)
        ) {
          ids.add(item.mediaFullFileId);
        }
      }
    }
  }
  return [...ids];
}

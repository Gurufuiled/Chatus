import type { TelegramMessageRow } from './types';
import { getNestedRecord } from './tdlibMapping';

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

    if (row.kind === 'album' && row.albumMedia?.length) {
      let albumChanged = false;
      const albumMedia = row.albumMedia.map((item) => {
        if (item.mediaFullFileId !== fileId) return item;
        albumChanged = true;
        return { ...item, mediaUri: uri, mediaFullFileId: undefined };
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

export function collectPendingTdlibFileIds(rows: TelegramMessageRow[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.mediaFullFileId != null) ids.add(row.mediaFullFileId);
    if (row.webPagePreview?.photoFileId != null) ids.add(row.webPagePreview.photoFileId);
    if (row.forwardInfo?.avatarFileId != null) ids.add(row.forwardInfo.avatarFileId);
    if (row.kind === 'album') {
      for (const item of row.albumMedia ?? []) {
        if (item.mediaFullFileId != null) ids.add(item.mediaFullFileId);
      }
    }
  }
  return [...ids];
}

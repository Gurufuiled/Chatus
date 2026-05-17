import type {
  FileItem,
  LinkItem,
  MediaTile,
  VoiceItem,
} from '../../components/ChatProfileMediaSection';
import type { TelegramMessageRow } from './types';

function formatMessageDate(ms: number): string {
  return new Date(ms).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function getFileExtension(fileName: string | undefined): string {
  const ext = fileName?.split('.').pop()?.trim() ?? '';
  if (!ext || ext === fileName) return 'FILE';
  return ext.slice(0, 4).toUpperCase();
}

/** Преобразует сообщения TDLib-чата в табы профиля (как в ChatProfileScreen). */
export function telegramRowsToProfileBuckets(
  rows: TelegramMessageRow[],
  peerLabel: string,
): {
  mediaItems: MediaTile[];
  fileItems: FileItem[];
  voiceItems: VoiceItem[];
  linkItems: LinkItem[];
} {
  const mediaItems: MediaTile[] = [];
  const fileItems: FileItem[] = [];
  const voiceItems: VoiceItem[] = [];
  const linkItems: LinkItem[] = [];

  for (const row of rows) {
    const dateLabel = formatMessageDate(row.dateMs);
    if (row.kind === 'image' && row.mediaUri) {
      mediaItems.push({
        id: row.id,
        kind: 'image',
        uri: row.mediaUri,
        previewUri: row.mediaUri,
        caption: row.text?.trim() ? row.text : undefined,
      });
    }
    if (row.kind === 'video' && row.mediaUri) {
      mediaItems.push({
        id: row.id,
        kind: 'video',
        uri: row.mediaUri,
        previewUri: row.thumbnailUri ?? row.mediaUri,
        durationMs: row.durationMs,
        caption: row.text?.trim() ? row.text : undefined,
      });
    }
    if (row.kind === 'file') {
      const sizePart = formatFileSize(row.fileSize);
      fileItems.push({
        id: row.id,
        title: row.fileName ?? 'Файл',
        subtitle: sizePart ? `${sizePart} • ${dateLabel}` : dateLabel,
        uri: row.mediaUri ?? null,
        extension: getFileExtension(row.fileName),
      });
    }
    if (row.kind === 'voice' && row.voiceUri) {
      voiceItems.push({
        id: row.id,
        kind: 'voice',
        uri: row.voiceUri,
        title: row.outgoing ? 'Вы' : peerLabel,
        durationMs: row.durationMs ?? 0,
        waveform: row.waveform ?? [],
        dateLabel,
      });
    }
    if (row.kind === 'video_note' && row.mediaUri) {
      voiceItems.push({
        id: row.id,
        kind: 'video_note',
        uri: row.mediaUri,
        thumbnailUri: row.thumbnailUri ?? undefined,
        title: row.outgoing ? 'Вы' : peerLabel,
        durationMs: row.durationMs ?? 0,
        waveform: [],
        dateLabel,
      });
    }
    if (row.kind === 'text' && row.text) {
      const matches = (row.text.match(/https?:\/\/[^\s]+/gi) ?? []) as string[];
      matches.forEach((uri, index) => {
        linkItems.push({
          id: `${row.id}-${index}`,
          title: uri.replace(/^https?:\/\//, ''),
          subtitle: dateLabel,
          uri,
        });
      });
    }
  }

  return { mediaItems, fileItems, voiceItems, linkItems };
}

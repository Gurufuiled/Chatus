import type { Message } from '../stores/types';
import { resolveMediaUrl } from '../config';
import type { MediaTile } from '../components/ChatProfileMediaSection';
import { channelPostMediaTileId } from './channelPostMediaTileId';

type VisualMediaItem = NonNullable<Message['media']>[number];

export function getVisualMediaKind(message: Message, media: VisualMediaItem): 'image' | 'video' {
  const mediaType = media.media_type?.toLowerCase();
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  return message.msg_type === 'video' ? 'video' : 'image';
}

/** Полноэкранный просмотр (лента канала, шапка обсуждения): те же тайлы, что в профиле чата. */
export function buildChannelPostMediaTiles(message: Message): MediaTile[] {
  const mediaList = (message.media ?? []).filter((m) => m.remote_url?.trim());
  const captionRaw = message.content?.trim();
  const caption = captionRaw && captionRaw.length > 0 ? captionRaw : undefined;
  return mediaList.map((m, i) => {
    const kind = getVisualMediaKind(message, m);
    const uri = m.remote_url!.trim();
    const thumb = m.thumbnail_url?.trim() || undefined;
    const preview = kind === 'video' ? thumb : thumb ?? uri;
    return {
      id: channelPostMediaTileId(message.id, i),
      kind,
      uri,
      previewUri: preview,
      durationMs: kind === 'video' ? m.duration_ms ?? undefined : undefined,
      caption: i === 0 ? caption : undefined,
    } satisfies MediaTile;
  });
}

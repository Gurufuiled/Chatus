import { useState } from 'react';
import { resolveMediaUrl } from '@/services/mediaService';
import type { MappedMedia } from '@/types/message';
import { ImageLightbox } from './ImageLightbox';

const ALBUM_WIDTH = 280;
const GAP = 2;

interface AlbumMessageContentProps {
  media: MappedMedia[];
  msgType: string;
  onOpenAt?: (index: number) => void;
}

function getVisualKind(msgType: string, item: MappedMedia): 'image' | 'video' {
  const mediaType = item.media_type?.toLowerCase();
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  return msgType === 'video' ? 'video' : 'image';
}

export function AlbumMessageContent({ media, msgType, onOpenAt }: AlbumMessageContentProps) {
  const [lightbox, setLightbox] = useState<{ src: string; index: number } | null>(null);
  const items = media.filter((m) => m.remote_url?.trim()).slice(0, 10);
  const visible = items.slice(0, 9);
  const extraCount = items.length - visible.length;

  const openAt = (index: number) => {
    if (onOpenAt) {
      onOpenAt(index);
      return;
    }
    const item = items[index];
    if (!item?.remote_url) return;
    const kind = getVisualKind(msgType, item);
    const src =
      kind === 'video'
        ? resolveMediaUrl(item.thumbnail_url || item.remote_url)
        : resolveMediaUrl(item.remote_url);
    setLightbox({ src, index });
  };

  const renderTile = (item: MappedMedia, index: number, style: React.CSSProperties) => {
    const kind = getVisualKind(msgType, item);
    const rawUri = kind === 'video' ? item.thumbnail_url || item.remote_url : item.remote_url;
    const src = rawUri ? resolveMediaUrl(rawUri) : '';
    const showExtra = index === visible.length - 1 && extraCount > 0;

    return (
      <button
        key={`${item.id}-${index}`}
        type="button"
        className="album-message__tile"
        style={style}
        aria-label="Открыть медиа"
        onClick={() => openAt(showExtra ? visible.length : index)}
      >
        {src ? <img src={src} alt="" className="album-message__img" loading="lazy" /> : null}
        {kind === 'video' ? (
          <span className="album-message__video-badge" aria-hidden>
            ▶
          </span>
        ) : null}
        {showExtra ? <span className="album-message__extra">+{extraCount}</span> : null}
      </button>
    );
  };

  const grid = (() => {
    if (visible.length === 1) {
      return renderTile(visible[0], 0, { width: ALBUM_WIDTH, height: ALBUM_WIDTH });
    }

    if (visible.length === 2) {
      const tileWidth = (ALBUM_WIDTH - GAP) / 2;
      return (
        <div className="album-message__row">
          {visible.map((item, index) =>
            renderTile(item, index, { width: tileWidth, height: ALBUM_WIDTH }),
          )}
        </div>
      );
    }

    if (visible.length === 3) {
      const sideWidth = (ALBUM_WIDTH - GAP) * 0.58;
      const rightWidth = ALBUM_WIDTH - sideWidth - GAP;
      const halfHeight = (ALBUM_WIDTH - GAP) / 2;
      return (
        <div className="album-message__row">
          {renderTile(visible[0], 0, { width: sideWidth, height: ALBUM_WIDTH })}
          <div className="album-message__column" style={{ width: rightWidth }}>
            {renderTile(visible[1], 1, { width: rightWidth, height: halfHeight })}
            {renderTile(visible[2], 2, { width: rightWidth, height: halfHeight })}
          </div>
        </div>
      );
    }

    if (visible.length === 4) {
      const tileW = (ALBUM_WIDTH - GAP) / 2;
      const tileH = (ALBUM_WIDTH - GAP) / 2;
      return (
        <div className="album-message__column" style={{ width: ALBUM_WIDTH }}>
          <div className="album-message__row">
            {renderTile(visible[0], 0, { width: tileW, height: tileH })}
            {renderTile(visible[1], 1, { width: tileW, height: tileH })}
          </div>
          <div className="album-message__row">
            {renderTile(visible[2], 2, { width: tileW, height: tileH })}
            {renderTile(visible[3], 3, { width: tileW, height: tileH })}
          </div>
        </div>
      );
    }

    const columns = 3;
    const tileWidth = (ALBUM_WIDTH - GAP * (columns - 1)) / columns;
    return (
      <div className="album-message__grid">
        {visible.map((item, index) =>
          renderTile(item, index, { width: tileWidth, height: tileWidth }),
        )}
      </div>
    );
  })();

  return (
    <>
      <div className="album-message" style={{ width: ALBUM_WIDTH }}>
        {grid}
      </div>
      {lightbox ? (
        <ImageLightbox src={lightbox.src} onClose={() => setLightbox(null)} />
      ) : null}
    </>
  );
}

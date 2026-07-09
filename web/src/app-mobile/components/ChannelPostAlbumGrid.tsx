import { useMemo } from 'react';
import { resolveMediaUrl } from '@/services/mediaService';
import type { MappedMedia, MappedMessage } from '@/types/message';
import {
  computeChannelMediaDisplaySize,
  formatChannelMediaDuration,
  getChannelPostAlbumMedia,
  getVisualMediaKind,
} from '../utils/channelPostMedia';

interface ChannelPostAlbumGridProps {
  post: MappedMessage;
}

type TileStyle = { width: number; height: number };

function AlbumTile({
  media,
  kind,
  style,
  showExtra,
  extraCount,
}: {
  media: MappedMedia;
  kind: 'image' | 'video';
  style: TileStyle;
  showExtra: boolean;
  extraCount: number;
}) {
  const rawUri =
    kind === 'video'
      ? media.thumbnail_url || media.remote_url
      : media.remote_url;
  const src = rawUri ? resolveMediaUrl(rawUri) : '';

  return (
    <div
      className="mobile-channel-album__tile"
      style={{ width: style.width, height: style.height }}
    >
      {src ? (
        kind === 'video' ? (
          <img src={src} alt="" className="mobile-channel-album__img" />
        ) : (
          <img src={src} alt="" className="mobile-channel-album__img" />
        )
      ) : (
        <div className="mobile-channel-album__fallback" aria-hidden />
      )}
      {kind === 'video' ? (
        <span className="mobile-channel-album__video-badge">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          {formatChannelMediaDuration(media.duration_ms ?? 0)}
        </span>
      ) : null}
      {showExtra ? (
        <span className="mobile-channel-album__extra">+{extraCount}</span>
      ) : null}
    </div>
  );
}

export function ChannelPostAlbumGrid({ post }: ChannelPostAlbumGridProps) {
  const media = useMemo(() => getChannelPostAlbumMedia(post), [post]);
  const visibleMedia = media.slice(0, 9);
  const extraCount = media.length - visibleMedia.length;
  const albumWidth = computeChannelMediaDisplaySize(
    post.media?.[0]?.width,
    post.media?.[0]?.height,
  ).width;
  const gap = 1.5;

  if (visibleMedia.length <= 1) return null;

  const renderTile = (mediaItem: MappedMedia, index: number, style: TileStyle) => {
    const kind = getVisualMediaKind(post, mediaItem);
    const showExtra = index === visibleMedia.length - 1 && extraCount > 0;
    return (
      <AlbumTile
        key={`${mediaItem.id}-${index}`}
        media={mediaItem}
        kind={kind}
        style={style}
        showExtra={showExtra}
        extraCount={extraCount}
      />
    );
  };

  let grid: React.ReactNode;

  if (visibleMedia.length === 2) {
    const tileWidth = (albumWidth - gap) / 2;
    grid = (
      <div className="mobile-channel-album__row">
        {visibleMedia.map((item, index) =>
          renderTile(item, index, { width: tileWidth, height: albumWidth }),
        )}
      </div>
    );
  } else if (visibleMedia.length === 3) {
    const sideWidth = (albumWidth - gap) * 0.58;
    const rightWidth = albumWidth - sideWidth - gap;
    const halfHeight = (albumWidth - gap) / 2;
    grid = (
      <div className="mobile-channel-album__row">
        {renderTile(visibleMedia[0], 0, { width: sideWidth, height: albumWidth })}
        <div className="mobile-channel-album__column" style={{ width: rightWidth }}>
          {renderTile(visibleMedia[1], 1, { width: rightWidth, height: halfHeight })}
          {renderTile(visibleMedia[2], 2, { width: rightWidth, height: halfHeight })}
        </div>
      </div>
    );
  } else if (visibleMedia.length === 4) {
    const tileW = (albumWidth - gap) / 2;
    const tileH = (albumWidth - gap) / 2;
    grid = (
      <div className="mobile-channel-album__column" style={{ width: albumWidth }}>
        <div className="mobile-channel-album__row">
          {renderTile(visibleMedia[0], 0, { width: tileW, height: tileH })}
          {renderTile(visibleMedia[1], 1, { width: tileW, height: tileH })}
        </div>
        <div className="mobile-channel-album__row">
          {renderTile(visibleMedia[2], 2, { width: tileW, height: tileH })}
          {renderTile(visibleMedia[3], 3, { width: tileW, height: tileH })}
        </div>
      </div>
    );
  } else {
    const columns = 3;
    const tileWidth = (albumWidth - gap * (columns - 1)) / columns;
    grid = (
      <div className="mobile-channel-album__grid">
        {visibleMedia.map((item, index) =>
          renderTile(item, index, { width: tileWidth, height: tileWidth }),
        )}
      </div>
    );
  }

  return (
    <div className="mobile-channel-album" style={{ width: albumWidth }}>
      {grid}
    </div>
  );
}

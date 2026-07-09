import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageMessageContent, VideoMessageContent } from '@/features/conversation/MediaMessageContent';
import { resolveMediaUrl } from '@/services/mediaService';
import { computeChannelMediaDisplaySize } from '../utils/channelPostMedia';

interface ChannelPostVisualMediaProps {
  msgType: 'image' | 'video' | 'video_note';
  url: string;
  poster?: string | null;
  round?: boolean;
  width?: number | null;
  height?: number | null;
}

export function ChannelPostVisualMedia({
  msgType,
  url,
  poster,
  round = false,
  width,
  height,
}: ChannelPostVisualMediaProps) {
  const naturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [frameSize, setFrameSize] = useState(() =>
    computeChannelMediaDisplaySize(width, height),
  );

  const recomputeSize = useCallback(() => {
    const source = width && height && width > 0 && height > 0
      ? { width, height }
      : naturalSizeRef.current;
    setFrameSize(
      computeChannelMediaDisplaySize(source?.width, source?.height),
    );
  }, [width, height]);

  const applyNaturalSize = useCallback(
    (naturalWidth: number, naturalHeight: number) => {
      if (width && height && width > 0 && height > 0) return;
      naturalSizeRef.current = { width: naturalWidth, height: naturalHeight };
      setFrameSize(computeChannelMediaDisplaySize(naturalWidth, naturalHeight));
    },
    [width, height],
  );

  useEffect(() => {
    naturalSizeRef.current = null;
    recomputeSize();
  }, [width, height, url, recomputeSize]);

  useEffect(() => {
    const onResize = () => recomputeSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeSize]);

  const frameStyle = {
    width: `${frameSize.width}px`,
    height: `${frameSize.height}px`,
  };

  if (msgType === 'image') {
    return (
      <div className="mobile-channel-post__media-frame" style={frameStyle}>
        <ChannelPostImage
          url={url}
          onNaturalSize={applyNaturalSize}
        />
      </div>
    );
  }

  return (
    <div className="mobile-channel-post__media-frame" style={frameStyle}>
      <VideoMessageContent
        url={url}
        poster={poster ? resolveMediaUrl(poster) : undefined}
        round={round}
      />
    </div>
  );
}

function ChannelPostImage({
  url,
  onNaturalSize,
}: {
  url: string;
  onNaturalSize: (w: number, h: number) => void;
}) {
  const src = resolveMediaUrl(url);

  return (
    <ImageMessageContent
      url={src}
      alt=""
      onImageLoad={(img) => onNaturalSize(img.naturalWidth, img.naturalHeight)}
    />
  );
}

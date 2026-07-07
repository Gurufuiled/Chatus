import { useEffect, useRef } from 'react';
import type { VideoTrack } from 'livekit-client';

type LiveKitVideoRendererProps = {
  track: VideoTrack;
  mirror?: boolean;
  className?: string;
};

export function LiveKitVideoRenderer({ track, mirror = false, className }: LiveKitVideoRendererProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={mirror}
      className={className}
    />
  );
}

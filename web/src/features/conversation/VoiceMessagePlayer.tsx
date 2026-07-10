import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { buildDecorativeWaveform, decodeWaveformBase64 } from '@/utils/waveform';
import { formatVoiceDuration } from '@/utils/formatFileSize';
import { VoicePlayerService } from './voicePlayerService';

interface VoiceMessagePlayerProps {
  src: string;
  durationMs: number;
  waveformBase64?: string | null;
  isOutgoing: boolean;
  meta?: ReactNode;
  authorLabel?: string | null;
}

const BAR_COUNT = 48;

function subscribe(listener: () => void) {
  return VoicePlayerService.subscribe(listener);
}

function getSnapshot() {
  return VoicePlayerService.getSnapshot();
}

export function VoiceMessagePlayer({
  src,
  durationMs,
  waveformBase64,
  isOutgoing,
  meta,
  authorLabel = null,
}: VoiceMessagePlayerProps) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isCurrent = snapshot.currentVoiceUri === src;
  const isPlaying = isCurrent && snapshot.status.isPlaying;
  const progress =
    isCurrent && snapshot.status.durationMs > 0
      ? Math.min(snapshot.status.positionMs / snapshot.status.durationMs, 1)
      : isCurrent && durationMs > 0
        ? Math.min(snapshot.status.positionMs / durationMs, 1)
        : 0;
  const remainingMs = isCurrent
    ? Math.max(
        (snapshot.status.durationMs > 0 ? snapshot.status.durationMs : durationMs) -
          snapshot.status.positionMs,
        0,
      )
    : durationMs;

  const bars = useMemo(() => {
    const decoded = decodeWaveformBase64(waveformBase64);
    if (decoded.length > 0) {
      const bucketSize = decoded.length / BAR_COUNT;
      return Array.from({ length: BAR_COUNT }, (_, i) => {
        const start = Math.floor(i * bucketSize);
        const end = Math.min(decoded.length, Math.ceil((i + 1) * bucketSize));
        const bucket = decoded.slice(start, Math.max(end, start + 1));
        const peak = Math.max(...bucket, 0);
        return 0.15 + peak * 0.85;
      });
    }
    return buildDecorativeWaveform(src, BAR_COUNT);
  }, [src, waveformBase64]);

  const handleToggle = useCallback(() => {
    if (isCurrent && isPlaying) {
      void VoicePlayerService.pause();
      return;
    }
    const resumeFrom = isCurrent ? snapshot.status.positionMs : 0;
    void VoicePlayerService.play(src, {
      positionMs: resumeFrom > 0 ? resumeFrom : undefined,
      authorLabel,
      durationMs,
    });
  }, [authorLabel, durationMs, isCurrent, isPlaying, snapshot.status.positionMs, src]);

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const effectiveDuration =
      (isCurrent && snapshot.status.durationMs > 0 ? snapshot.status.durationMs : 0) ||
      (durationMs > 0 ? durationMs : 0);
    if (effectiveDuration <= 0) {
      void VoicePlayerService.play(src, { authorLabel, durationMs: durationMs || undefined });
      return;
    }
    const targetMs = Math.round(ratio * effectiveDuration);

    if (!isCurrent) {
      void VoicePlayerService.play(src, {
        positionMs: targetMs,
        authorLabel,
        durationMs: effectiveDuration,
      });
      return;
    }

    void VoicePlayerService.seekTo(targetMs);
    if (!isPlaying) {
      void VoicePlayerService.play(src, {
        positionMs: targetMs,
        authorLabel,
        durationMs: effectiveDuration,
      });
    }
  };

  const filledCount = Math.round(progress * BAR_COUNT);
  const durationLabel =
    isPlaying || progress > 0
      ? formatVoiceDuration(remainingMs)
      : formatVoiceDuration(durationMs);

  return (
    <div
      className={`voice-message-player${isOutgoing ? ' voice-message-player--outgoing' : ' voice-message-player--incoming'}${isPlaying ? ' voice-message-player--playing' : ''}`}
    >
      <button
        type="button"
        className="voice-message-player__play"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={handleToggle}
      >
        {isPlaying ? (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="voice-message-player__body">
        <div
          className="voice-message-player__waveform"
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onClick={handleWaveformClick}
        >
          {bars.map((value, index) => (
            <span
              key={index}
              className={`voice-message-player__bar${index < filledCount ? ' voice-message-player__bar--filled' : ''}`}
              style={{ height: `${Math.round(4 + value * 18)}px` }}
            />
          ))}
        </div>
        <div className="voice-message-player__meta-row">
          <span className="voice-message-player__duration">{durationLabel}</span>
          {meta ? <div className="voice-message-player__meta">{meta}</div> : null}
        </div>
      </div>
    </div>
  );
}

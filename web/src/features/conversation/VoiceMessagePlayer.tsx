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

/** Match mobile VoiceBubble bar density. */
const BAR_COUNT = 74;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function subscribe(listener: () => void) {
  return VoicePlayerService.subscribe(listener);
}

function getSnapshot() {
  return VoicePlayerService.getSnapshot();
}

function buildTelegramLikeBars(
  src: string,
  waveform: number[],
  targetCount: number,
): number[] {
  if (waveform.length === 0) {
    return buildDecorativeWaveform(src, targetCount);
  }

  const clamped = waveform.map(clamp01);
  const bucketSize = clamped.length / targetCount;
  const bars = Array.from({ length: targetCount }, (_, i) => {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(clamped.length, Math.ceil((i + 1) * bucketSize));
    const bucket = clamped.slice(start, Math.max(end, start + 1));
    if (bucket.length === 0) return 0;
    const peak = Math.max(...bucket);
    const avg = bucket.reduce((s, v) => s + v, 0) / bucket.length;
    return peak * 0.6 + avg * 0.4;
  });

  const min = Math.min(...bars);
  const max = Math.max(...bars);
  const spread = max - min;
  if (spread < 0.005) {
    return buildDecorativeWaveform(src, targetCount);
  }

  return bars.map((value, index) => {
    const normalized = (value - min) / spread;
    const t = targetCount <= 1 ? 0.5 : index / (targetCount - 1);
    const edgeTaper = 0.88 + Math.sin(t * Math.PI) * 0.12;
    return clamp01(normalized * edgeTaper);
  });
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
  const effectiveDurationMs =
    isCurrent && snapshot.status.durationMs > 0
      ? snapshot.status.durationMs
      : durationMs > 0
        ? durationMs
        : 0;
  const progress =
    isCurrent && effectiveDurationMs > 0
      ? Math.min(snapshot.status.positionMs / effectiveDurationMs, 1)
      : 0;
  const remainingMs = isCurrent
    ? Math.max(effectiveDurationMs - snapshot.status.positionMs, 0)
    : durationMs;

  const bars = useMemo(() => {
    const decoded = decodeWaveformBase64(waveformBase64);
    return buildTelegramLikeBars(src, decoded, BAR_COUNT);
  }, [src, waveformBase64]);

  const barHeights = useMemo(
    () =>
      bars.map((value) => {
        const v = clamp01(value ?? 0);
        return 2 + Math.pow(v, 1.4) * 22;
      }),
    [bars],
  );

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
    const ratio = clamp01((e.clientX - rect.left) / rect.width);
    const seekDuration =
      (isCurrent && snapshot.status.durationMs > 0 ? snapshot.status.durationMs : 0) ||
      (durationMs > 0 ? durationMs : 0);
    if (seekDuration <= 0) {
      void VoicePlayerService.play(src, { authorLabel, durationMs: durationMs || undefined });
      return;
    }
    const targetMs = Math.round(ratio * seekDuration);

    if (!isCurrent) {
      void VoicePlayerService.play(src, {
        positionMs: targetMs,
        authorLabel,
        durationMs: seekDuration,
      });
      return;
    }

    void VoicePlayerService.seekTo(targetMs);
    if (!isPlaying) {
      void VoicePlayerService.play(src, {
        positionMs: targetMs,
        authorLabel,
        durationMs: seekDuration,
      });
    }
  };

  const durationLabel =
    isCurrent && (isPlaying || progress > 0)
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
          {barHeights.map((barHeight, index) => {
            // Match mobile VoiceBubble: fill bars by playback ratio.
            const isFilled = progress > 0 && index / BAR_COUNT <= progress;
            return (
              <span
                key={index}
                className={`voice-message-player__bar${isFilled ? ' voice-message-player__bar--filled' : ''}`}
                style={{ height: `${Math.round(barHeight)}px` }}
              />
            );
          })}
        </div>
        <div className="voice-message-player__meta-row">
          <span className="voice-message-player__duration">{durationLabel}</span>
          {meta ? <div className="voice-message-player__meta">{meta}</div> : null}
        </div>
      </div>
    </div>
  );
}

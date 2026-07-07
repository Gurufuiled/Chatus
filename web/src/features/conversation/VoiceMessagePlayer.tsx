import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildDecorativeWaveform, decodeWaveformBase64 } from '@/utils/waveform';
import { formatVoiceDuration } from '@/utils/formatFileSize';

interface VoiceMessagePlayerProps {
  src: string;
  durationMs: number;
  waveformBase64?: string | null;
  isOutgoing: boolean;
  meta?: ReactNode;
}

const BAR_COUNT = 48;

let activeAudio: HTMLAudioElement | null = null;
let activeStop: (() => void) | null = null;

function stopActivePlayback() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  activeStop?.();
  activeStop = null;
}

export function VoiceMessagePlayer({
  src,
  durationMs,
  waveformBase64,
  isOutgoing,
  meta,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remainingMs, setRemainingMs] = useState(durationMs);

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

  const cleanup = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }
    setIsPlaying(false);
    setProgress(0);
    setRemainingMs(durationMs);
    if (activeAudio === audio) {
      activeAudio = null;
      activeStop = null;
    }
  }, [durationMs]);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleToggle = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    stopActivePlayback();

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(src);
      audioRef.current = audio;
      audio.addEventListener('timeupdate', () => {
        if (!audioRef.current) return;
        const dur = audioRef.current.duration;
        const current = audioRef.current.currentTime;
        if (Number.isFinite(dur) && dur > 0) {
          setProgress(current / dur);
          setRemainingMs(Math.max(0, (dur - current) * 1000));
        }
      });
      audio.addEventListener('ended', () => cleanup());
      audio.addEventListener('error', () => cleanup());
    }

    activeAudio = audio;
    activeStop = cleanup;
    void audio.play().then(() => setIsPlaying(true)).catch(() => cleanup());
  };

  const seekToRatio = useCallback(
    (audio: HTMLAudioElement, ratio: number, autoplay: boolean) => {
      const apply = () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        audio.currentTime = audio.duration * ratio;
        setProgress(ratio);
        setRemainingMs(Math.max(0, (audio.duration - audio.currentTime) * 1000));
        if (autoplay) {
          stopActivePlayback();
          activeAudio = audio;
          activeStop = cleanup;
          void audio.play().then(() => setIsPlaying(true)).catch(() => cleanup());
        }
      };
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        apply();
      } else {
        audio.addEventListener('loadedmetadata', apply, { once: true });
      }
    },
    [cleanup],
  );

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    let audio = audioRef.current;
    if (!audio) {
      handleToggle();
      audio = audioRef.current;
      if (!audio) return;
      seekToRatio(audio, ratio, true);
      return;
    }
    seekToRatio(audio, ratio, !isPlaying);
  };

  const filledCount = Math.round(progress * BAR_COUNT);
  const durationLabel =
    isPlaying || progress > 0
      ? formatVoiceDuration(remainingMs)
      : formatVoiceDuration(durationMs);

  return (
    <div
      className={`voice-message-player${isOutgoing ? ' voice-message-player--outgoing' : ' voice-message-player--incoming'}`}
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

import { useMemo, useSyncExternalStore } from 'react';
import { VoicePlayerService } from '@/features/conversation/voicePlayerService';
import {
  getVideoNotePlaybackSnapshot,
  stopActiveVideoNotePlayback,
  subscribeToVideoNotePlayback,
  toggleActiveVideoNotePlayback,
} from '@/features/conversation/videoNotePlayerService';
import { formatVoiceDuration } from '@/utils/formatFileSize';

function subscribeVoice(listener: () => void) {
  return VoicePlayerService.subscribe(listener);
}

function getVoiceSnapshot() {
  return VoicePlayerService.getSnapshot();
}

function formatPlaybackElapsed(positionMs: number, durationMs: number): string {
  if (durationMs <= 0) return formatVoiceDuration(positionMs);
  return `${formatVoiceDuration(positionMs)} / ${formatVoiceDuration(durationMs)}`;
}

interface MobilePlaybackBannerProps {
  resolveVoiceAuthor?: (uri: string) => string | null;
  resolveVideoNoteAuthor?: (messageId: string | null, uri: string | null) => string | null;
}

export function MobilePlaybackBanner({
  resolveVoiceAuthor,
  resolveVideoNoteAuthor,
}: MobilePlaybackBannerProps) {
  const voice = useSyncExternalStore(subscribeVoice, getVoiceSnapshot, getVoiceSnapshot);
  const videoNote = useSyncExternalStore(
    subscribeToVideoNotePlayback,
    getVideoNotePlaybackSnapshot,
    getVideoNotePlaybackSnapshot,
  );

  const voiceVisible = Boolean(voice.currentVoiceUri);
  const videoVisible = Boolean(videoNote.messageId && videoNote.uri);

  const voiceAuthor = useMemo(() => {
    if (!voice.currentVoiceUri) return null;
    return (
      resolveVoiceAuthor?.(voice.currentVoiceUri) ??
      voice.authorLabel ??
      'Голосовое сообщение'
    );
  }, [resolveVoiceAuthor, voice.authorLabel, voice.currentVoiceUri]);

  const videoAuthor = useMemo(() => {
    if (!videoNote.uri) return null;
    return (
      resolveVideoNoteAuthor?.(videoNote.messageId, videoNote.uri) ??
      videoNote.authorLabel ??
      'Видеосообщение'
    );
  }, [resolveVideoNoteAuthor, videoNote.authorLabel, videoNote.messageId, videoNote.uri]);

  const voiceProgress =
    voice.status.durationMs > 0
      ? Math.min(voice.status.positionMs / voice.status.durationMs, 1)
      : 0;

  if (!voiceVisible && !videoVisible) return null;

  return (
    <div className="mobile-playback-banners" aria-live="polite">
      {voiceVisible ? (
        <div className="mobile-playback-banner mobile-playback-banner--voice">
          <button
            type="button"
            className="mobile-playback-banner__play"
            aria-label={voice.status.isPlaying ? 'Пауза' : 'Воспроизвести'}
            onClick={() => {
              if (!voice.currentVoiceUri) return;
              if (voice.status.isPlaying) {
                void VoicePlayerService.pause();
                return;
              }
              stopActiveVideoNotePlayback();
              void VoicePlayerService.play(voice.currentVoiceUri);
            }}
          >
            {voice.status.isPlaying ? (
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="mobile-playback-banner__text">
            <span className="mobile-playback-banner__author">{voiceAuthor}</span>
            <span className="mobile-playback-banner__subtitle">Голосовое сообщение</span>
          </div>
          <button
            type="button"
            className="mobile-playback-banner__rate"
            aria-label="Скорость воспроизведения"
            onClick={() => VoicePlayerService.cyclePlaybackRate()}
          >
            {VoicePlayerService.formatRateLabel(voice.status.rate || 1)}
          </button>
          <button
            type="button"
            className="mobile-playback-banner__close"
            aria-label="Остановить"
            onClick={() => void VoicePlayerService.stop()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
          <div className="mobile-playback-banner__progress" aria-hidden>
            <div
              className="mobile-playback-banner__progress-fill"
              style={{ width: `${Math.max(voiceProgress * 100, 0)}%` }}
            />
          </div>
        </div>
      ) : null}

      {videoVisible ? (
        <div className="mobile-playback-banner mobile-playback-banner--video">
          <button
            type="button"
            className="mobile-playback-banner__play mobile-playback-banner__play--video"
            aria-label={videoNote.isPlaying ? 'Пауза' : 'Воспроизвести'}
            onClick={() => toggleActiveVideoNotePlayback()}
          >
            {videoNote.isPlaying ? (
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="mobile-playback-banner__text">
            <span className="mobile-playback-banner__author">{videoAuthor}</span>
            <span className="mobile-playback-banner__subtitle">Видеосообщение</span>
          </div>
          <span className="mobile-playback-banner__meta">
            {formatPlaybackElapsed(videoNote.positionMs, videoNote.durationMs)}
          </span>
          <button
            type="button"
            className="mobile-playback-banner__close"
            aria-label="Остановить"
            onClick={() => stopActiveVideoNotePlayback()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
          <div className="mobile-playback-banner__progress mobile-playback-banner__progress--video" aria-hidden>
            <div
              className="mobile-playback-banner__progress-fill mobile-playback-banner__progress-fill--video"
              style={{ width: `${Math.max(videoNote.progress * 100, 0)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

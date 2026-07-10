import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveMediaUrl } from '@/services/mediaService';
import { formatFileSize } from '@/utils/formatFileSize';
import { VoicePlayerService } from './voicePlayerService';
import {
  clearActiveVideoNoteController,
  clearVideoNotePlaybackSnapshot,
  getVideoNotePlaybackSnapshot,
  setActiveVideoNoteController,
  setVideoNotePlaybackSnapshot,
  stopActiveVideoNotePlayback,
} from './videoNotePlayerService';

interface FileMessageContentProps {
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  url: string;
}

function fileIconLabel(mimeType: string | null, fileName: string | null): string {
  const mime = mimeType?.toLowerCase() ?? '';
  const name = fileName?.toLowerCase() ?? '';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel') || name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return 'XLS';
  }
  if (mime.startsWith('audio/')) return 'AUD';
  if (mime.startsWith('video/')) return 'VID';
  if (mime.startsWith('image/')) return 'IMG';
  return 'FILE';
}

export function FileMessageContent({ fileName, fileSize, mimeType, url }: FileMessageContentProps) {
  const label = fileName?.trim() || 'File';
  const sizeLabel = formatFileSize(fileSize);
  const href = resolveMediaUrl(url);

  return (
    <a
      className="file-message"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={fileName ?? undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="file-message__icon" aria-hidden>
        {fileIconLabel(mimeType, fileName)}
      </span>
      <span className="file-message__info">
        <span className="file-message__name">{label}</span>
        {sizeLabel ? <span className="file-message__size">{sizeLabel}</span> : null}
      </span>
    </a>
  );
}

interface ImageMessageContentProps {
  url: string;
  alt?: string;
  onImageLoad?: (img: HTMLImageElement) => void;
}

export function ImageMessageContent({ url, alt = 'Photo', onImageLoad }: ImageMessageContentProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = resolveMediaUrl(url);

  useEffect(() => {
    if (!lightboxOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightboxOpen]);

  return (
    <>
      <button
        type="button"
        className="image-message"
        onClick={() => setLightboxOpen(true)}
        aria-label="Open image"
      >
        <img
          src={src}
          alt={alt}
          className="image-message__img"
          loading="lazy"
          onLoad={(e) => onImageLoad?.(e.currentTarget)}
        />
      </button>
      {lightboxOpen ? (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="image-lightbox__close"
            aria-label="Close"
            onClick={() => setLightboxOpen(false)}
          >
            ×
          </button>
          <img src={src} alt={alt} className="image-lightbox__img" />
        </div>
      ) : null}
    </>
  );
}

interface VideoMessageContentProps {
  url: string;
  poster?: string | null;
  round?: boolean;
  messageId?: string;
  authorLabel?: string | null;
  durationMs?: number;
  registerPlayback?: boolean;
}

export function VideoMessageContent({
  url,
  poster,
  round = false,
  messageId,
  authorLabel = null,
  durationMs = 0,
  registerPlayback = true,
}: VideoMessageContentProps) {
  const src = resolveMediaUrl(url);
  const posterSrc = poster ? resolveMediaUrl(poster) : undefined;
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const noteId = messageId ?? src;
  const noteIdRef = useRef(noteId);
  const authorLabelRef = useRef(authorLabel);
  const durationMsRef = useRef(durationMs);
  const controllerRef = useRef<{ togglePlayback: () => void; stopPlayback: () => void } | null>(null);
  noteIdRef.current = noteId;
  authorLabelRef.current = authorLabel;
  durationMsRef.current = durationMs;

  const publishSnapshot = useCallback(() => {
    if (!round || !registerPlayback) return;
    const active = getVideoNotePlaybackSnapshot();
    // Only the active controller may publish (avoids thrash when switching notes).
    if (
      active.messageId != null &&
      active.messageId !== noteIdRef.current &&
      controllerRef.current == null
    ) {
      return;
    }
    const video = videoRef.current;
    const mediaDurationMs =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : durationMsRef.current;
    const positionMs = video ? Math.round(video.currentTime * 1000) : 0;
    const progress =
      mediaDurationMs > 0 ? Math.min(Math.max(positionMs / mediaDurationMs, 0), 1) : 0;
    setVideoNotePlaybackSnapshot({
      messageId: noteIdRef.current,
      uri: src,
      authorLabel: authorLabelRef.current,
      isPlaying: Boolean(video && !video.paused && !video.ended),
      positionMs,
      durationMs: mediaDurationMs,
      progress,
    });
  }, [registerPlayback, round, src]);

  const stopPlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setIsPlaying(false);
    clearVideoNotePlaybackSnapshot(noteIdRef.current);
    clearActiveVideoNoteController(controllerRef.current);
    controllerRef.current = null;
  }, []);

  const togglePlayback = useCallback(() => {
    if (!round) return;
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused && !video.ended) {
      video.pause();
      setIsPlaying(false);
      publishSnapshot();
      return;
    }

    // Exclusive: stop any other active video note before claiming the controller.
    const active = getVideoNotePlaybackSnapshot();
    if (active.messageId && active.messageId !== noteIdRef.current) {
      stopActiveVideoNotePlayback();
    }

    void VoicePlayerService.stop();
    const controller = {
      togglePlayback: () => {
        const el = videoRef.current;
        if (!el) return;
        if (!el.paused && !el.ended) {
          el.pause();
          setIsPlaying(false);
          publishSnapshot();
          return;
        }
        void VoicePlayerService.stop();
        void el
          .play()
          .then(() => {
            setIsPlaying(true);
            publishSnapshot();
          })
          .catch(() => {
            setIsPlaying(false);
            clearVideoNotePlaybackSnapshot(noteIdRef.current);
            clearActiveVideoNoteController(controllerRef.current);
            controllerRef.current = null;
          });
      },
      stopPlayback,
    };
    controllerRef.current = controller;
    setActiveVideoNoteController(controller);
    void video
      .play()
      .then(() => {
        setIsPlaying(true);
        publishSnapshot();
      })
      .catch(() => {
        setIsPlaying(false);
        clearVideoNotePlaybackSnapshot(noteIdRef.current);
        clearActiveVideoNoteController(controller);
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      });
  }, [publishSnapshot, round, stopPlayback]);

  useEffect(() => {
    if (!round || !registerPlayback) return;
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (getVideoNotePlaybackSnapshot().messageId !== noteIdRef.current) return;
      publishSnapshot();
    };
    const onPlay = () => {
      setIsPlaying(true);
      if (getVideoNotePlaybackSnapshot().messageId === noteIdRef.current) {
        publishSnapshot();
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      if (getVideoNotePlaybackSnapshot().messageId === noteIdRef.current) {
        publishSnapshot();
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      clearVideoNotePlaybackSnapshot(noteIdRef.current);
      clearActiveVideoNoteController(controllerRef.current);
      controllerRef.current = null;
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      if (controllerRef.current) {
        video.pause();
        clearVideoNotePlaybackSnapshot(noteIdRef.current);
        clearActiveVideoNoteController(controllerRef.current);
        controllerRef.current = null;
      }
    };
  }, [noteId, publishSnapshot, registerPlayback, round, src]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlayback();
  };

  return (
    <div
      className={`video-message-container${round ? ' video-message-container--round' : ''}`}
      onClick={handleTogglePlay}
    >
      <video
        ref={videoRef}
        className={`video-message${round ? ' video-message--round' : ''}`}
        src={src}
        poster={posterSrc}
        controls={!round}
        preload="metadata"
        playsInline={round}
        onPlay={() => round && setIsPlaying(true)}
        onPause={() => round && setIsPlaying(false)}
      />
      {round && !isPlaying && (
        <div className="video-message__play-overlay">
          <svg viewBox="0 0 24 24" className="video-message__play-icon">
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { resolveMediaUrl } from '@/services/mediaService';
import { formatFileSize } from '@/utils/formatFileSize';

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
}

export function ImageMessageContent({ url, alt = 'Photo' }: ImageMessageContentProps) {
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
        <img src={src} alt={alt} className="image-message__img" loading="lazy" />
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
}

export function VideoMessageContent({ url, poster, round = false }: VideoMessageContentProps) {
  const src = resolveMediaUrl(url);
  const posterSrc = poster ? resolveMediaUrl(poster) : undefined;
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTogglePlay = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!round) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      className={`video-message-container${round ? ' video-message-container--round' : ''}`}
      onClick={handleTogglePlay}
      role={round ? 'button' : undefined}
      tabIndex={round ? 0 : undefined}
      aria-label={round ? (isPlaying ? 'Пауза' : 'Воспроизвести видеосообщение') : undefined}
      onKeyDown={round ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTogglePlay(e);
        }
      } : undefined}
    >
      <video
        ref={videoRef}
        className={`video-message${round ? ' video-message--round' : ''}`}
        src={src}
        poster={posterSrc}
        controls={!round}
        preload="metadata"
        loop={round}
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

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
  allowDownload?: boolean;
}

export function ImageLightbox({
  src,
  alt = 'Photo',
  onClose,
  allowDownload = true,
}: ImageLightboxProps) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
      onClick={onClose}
    >
      <button
        type="button"
        className="image-lightbox__close"
        aria-label="Закрыть"
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className="image-lightbox__img"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={allowDownload ? undefined : (e) => e.preventDefault()}
        draggable={allowDownload}
      />
      {!allowDownload ? (
        <p className="image-lightbox__restricted">Сохранение запрещено в этой группе</p>
      ) : null}
    </div>,
    document.body,
  );
}

import { useState } from 'react';
import { useComposerStore, EMPTY_PENDING_ATTACHMENTS } from '@/stores/composerStore';
import { ImageLightbox } from '@/features/conversation/ImageLightbox';

interface MobileComposerAttachmentPreviewProps {
  chatId: string;
}

export function MobileComposerAttachmentPreview({ chatId }: MobileComposerAttachmentPreviewProps) {
  const pendingAttachments = useComposerStore((s) => s.pendingAttachments[chatId]);
  const attachments = pendingAttachments ?? EMPTY_PENDING_ATTACHMENTS;
  const removePendingAttachment = useComposerStore((s) => s.removePendingAttachment);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!attachments.length) return null;

  return (
    <>
      <div className="mobile-composer-attachments" aria-label="Вложения перед отправкой">
        {attachments.map((item) => (
          <div key={item.id} className="mobile-composer-attachments__item">
            <button
              type="button"
              className="mobile-composer-attachments__thumb"
              aria-label="Открыть превью"
              onClick={() => setLightboxSrc(item.previewUrl)}
            >
              {item.file.type.startsWith('video/') ? (
                <video
                  src={item.previewUrl}
                  className="mobile-composer-attachments__media"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img src={item.previewUrl} alt="" className="mobile-composer-attachments__media" />
              )}
            </button>
            <button
              type="button"
              className="mobile-composer-attachments__edit"
              aria-label="Редактировать (скоро)"
              onClick={() => setLightboxSrc(item.previewUrl)}
            >
              Ред.
            </button>
            <button
              type="button"
              className="mobile-composer-attachments__remove"
              aria-label="Удалить вложение"
              onClick={() => removePendingAttachment(chatId, item.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      {lightboxSrc ? (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      ) : null}
    </>
  );
}

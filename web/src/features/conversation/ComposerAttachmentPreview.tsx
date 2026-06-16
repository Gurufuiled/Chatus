import { useState } from 'react';
import { useComposerStore, EMPTY_PENDING_ATTACHMENTS } from '@/stores/composerStore';
import { ImageLightbox } from './ImageLightbox';

interface ComposerAttachmentPreviewProps {
  chatId: string;
}

export function ComposerAttachmentPreview({ chatId }: ComposerAttachmentPreviewProps) {
  const pendingAttachments = useComposerStore((s) => s.pendingAttachments[chatId]);
  const attachments = pendingAttachments ?? EMPTY_PENDING_ATTACHMENTS;
  const removePendingAttachment = useComposerStore((s) => s.removePendingAttachment);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!attachments.length) return null;

  return (
    <>
      <div className="composer-attachments" aria-label="Вложения перед отправкой">
        {attachments.map((item) => (
          <div key={item.id} className="composer-attachments__item">
            <button
              type="button"
              className="composer-attachments__thumb"
              aria-label="Открыть превью"
              onClick={() => setLightboxSrc(item.previewUrl)}
            >
              {item.file.type.startsWith('video/') ? (
                <video
                  src={item.previewUrl}
                  className="composer-attachments__img"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img src={item.previewUrl} alt="" className="composer-attachments__img" />
              )}
            </button>
            <button
              type="button"
              className="composer-attachments__remove"
              aria-label="Удалить вложение"
              onClick={() => removePendingAttachment(chatId, item.id)}
            >
              ×
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

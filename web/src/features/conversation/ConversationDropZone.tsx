import { useCallback } from 'react';
import { useUploadAttachmentMutation } from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';

interface ConversationDropZoneProps {
  chatId: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function hasFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

export function ConversationDropZone({
  chatId,
  disabled = false,
  children,
}: ConversationDropZoneProps) {
  const dragDepth = useComposerStore((s) => s.dragDepth);
  const incrementDragDepth = useComposerStore((s) => s.incrementDragDepth);
  const decrementDragDepth = useComposerStore((s) => s.decrementDragDepth);
  const resetDragDepth = useComposerStore((s) => s.resetDragDepth);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const upload = useUploadAttachmentMutation();

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !hasFileDrag(e)) return;
      e.preventDefault();
      incrementDragDepth();
    },
    [disabled, incrementDragDepth],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      decrementDragDepth();
    },
    [decrementDragDepth],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      resetDragDepth();
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      for (const file of files) {
        try {
          await upload.mutateAsync({
            chatId,
            file,
            replyToId: replyToMessageId,
          });
        } catch {
          /* error surfaced via composer store */
        }
      }
    },
    [chatId, disabled, replyToMessageId, resetDragDepth, upload],
  );

  const showOverlay = dragDepth > 0 && !disabled;

  return (
    <div
      className="conversation-drop-zone"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {showOverlay ? (
        <div className="conversation-drop-zone__overlay" aria-live="polite">
          <p className="conversation-drop-zone__text">
            Отпустите файлы для отправки
          </p>
        </div>
      ) : null}
    </div>
  );
}

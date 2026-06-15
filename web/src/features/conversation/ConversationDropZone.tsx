import { useCallback, useState } from 'react';
import { useUploadAttachmentMutation } from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';

interface ConversationDropZoneProps {
  chatId: string;
  disabled?: boolean;
  children: React.ReactNode;
}

type DropMode = 'file' | 'quick';

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
  const setComposerError = useComposerStore((s) => s.setComposerError);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const upload = useUploadAttachmentMutation();
  const [hoverMode, setHoverMode] = useState<DropMode | null>(null);

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
      if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
      e.preventDefault();
      decrementDragDepth();
      setHoverMode(null);
    },
    [decrementDragDepth],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleZoneDragOver = useCallback((mode: DropMode) => {
    setHoverMode(mode);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, mode: DropMode) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      resetDragDepth();
      setHoverMode(null);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      for (const file of files) {
        try {
          await upload.mutateAsync({
            chatId,
            file,
            replyToId: replyToMessageId,
            compressImages: mode === 'quick',
            sendAsFile: mode === 'file',
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
      onDrop={(e) => {
        e.preventDefault();
        resetDragDepth();
        setHoverMode(null);
        if (hasFileDrag(e) && !disabled && e.dataTransfer.files.length > 0) {
          setComposerError(chatId, 'Перетащите файл в одну из зон для отправки');
        }
      }}
    >
      {children}
      {showOverlay ? (
        <div className="conversation-drop-zone__overlay" aria-live="polite">
          <div
            className={`conversation-drop-zone__zone conversation-drop-zone__zone--file${hoverMode === 'file' ? ' conversation-drop-zone__zone--active' : ''}`}
            onDragOver={(e) => {
              handleDragOver(e);
              handleZoneDragOver('file');
            }}
            onDrop={(e) => void handleDrop(e, 'file')}
          >
            <p className="conversation-drop-zone__title">Перетащите файлы сюда</p>
            <p className="conversation-drop-zone__hint">для отправки без сжатия</p>
          </div>
          <div
            className={`conversation-drop-zone__zone conversation-drop-zone__zone--quick${hoverMode === 'quick' ? ' conversation-drop-zone__zone--active' : ''}`}
            onDragOver={(e) => {
              handleDragOver(e);
              handleZoneDragOver('quick');
            }}
            onDrop={(e) => void handleDrop(e, 'quick')}
          >
            <p className="conversation-drop-zone__title">Перетащите файлы сюда</p>
            <p className="conversation-drop-zone__hint">для быстрой отправки</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

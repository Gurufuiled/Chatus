import { useEffect, useRef } from 'react';
import { useUploadAttachmentMutation } from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';

interface AttachmentPickerProps {
  chatId: string;
  disabled?: boolean;
}

const ACCEPT =
  'image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain';

export function AttachmentPicker({ chatId, disabled = false }: AttachmentPickerProps) {
  const open = useComposerStore((s) => s.isAttachmentPickerOpen);
  const setOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const upload = useUploadAttachmentMutation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !disabled) {
      inputRef.current?.click();
      setOpen(false);
    }
  }, [open, disabled, setOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const queue = Array.from(files);
    e.target.value = '';
    void processQueue(queue);
  };

  const processQueue = async (files: File[]) => {
    for (const file of files) {
      try {
        await upload.mutateAsync({
          chatId,
          file,
          replyToId: replyToMessageId,
        });
      } catch {
        /* surfaced via composer error banner */
      }
    }
  };

  return (
    <input
      ref={inputRef}
      type="file"
      className="attachment-picker__input"
      accept={ACCEPT}
      multiple
      tabIndex={-1}
      aria-hidden
      onChange={handleChange}
    />
  );
}

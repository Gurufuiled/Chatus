import { useEffect, useRef, useState } from 'react';
import {
  isStageableAlbumMedia,
  useUploadAttachmentMutation,
} from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';
import { useChatsQuery } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { canCreatePolls } from '@/utils/chatPermissions';
import { CreatePollDialog } from './PollMessageContent';
import './attachment-menu.css';

interface AttachmentPickerProps {
  chatId: string;
  disabled?: boolean;
}

export const ACCEPT =
  'image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain';

export function AttachmentPicker({ chatId, disabled = false }: AttachmentPickerProps) {
  const open = useComposerStore((s) => s.isAttachmentPickerOpen);
  const setOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const addPendingAttachment = useComposerStore((s) => s.addPendingAttachment);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const upload = useUploadAttachmentMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const { data: chats } = useChatsQuery();
  const { data: me } = useMeQuery();
  const chat = chats?.find((c) => c.id === chatId);
  const allowPolls = canCreatePolls(chat, me);

  useEffect(() => {
    if (open && !disabled) {
      setMenuOpen(true);
      setOpen(false);
    }
  }, [open, disabled, setOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const queue = Array.from(files);
    e.target.value = '';
    void processQueue(queue);
  };

  const processQueue = async (files: File[]) => {
    for (const file of files) {
      if (isStageableAlbumMedia(file)) {
        addPendingAttachment(chatId, file, false);
        continue;
      }
      try {
        await upload.mutateAsync({
          chatId,
          file,
          replyToId: replyToMessageId,
          compressImages: true,
        });
      } catch {
        /* surfaced via composer error banner */
      }
    }
  };

  const pickFile = () => {
    setMenuOpen(false);
    inputRef.current?.click();
  };

  const openPoll = () => {
    setMenuOpen(false);
    setPollOpen(true);
  };

  return (
    <>
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
      {menuOpen ? (
        <div className="attachment-menu" ref={menuRef} role="menu" aria-label="Вложение">
          <button type="button" role="menuitem" className="attachment-menu__item" onClick={pickFile}>
            Файл или медиа
          </button>
          <button
            type="button"
            role="menuitem"
            className="attachment-menu__item"
            disabled={!allowPolls}
            title={!allowPolls ? 'Недостаточно прав для создания опросов' : undefined}
            onClick={openPoll}
          >
            Опрос
          </button>
        </div>
      ) : null}
      <CreatePollDialog
        open={pollOpen}
        chatId={chatId}
        canCreate={allowPolls}
        onClose={() => setPollOpen(false)}
      />
    </>
  );
}

import { useEffect, useRef } from 'react';
import { FRIEND_STICKER_ITEMS, STICKER_URL_BY_ID } from '@/data/stickerCatalog';
import { useSendStickerMessageMutation } from '@/queries/messages.queries';
import { useComposerStore } from '@/stores/composerStore';
import type { ChatusStickerRef } from '@/utils/stickerPayload';

interface StickerPickerProps {
  chatId: string;
  disabled?: boolean;
}

export function StickerPicker({ chatId, disabled = false }: StickerPickerProps) {
  const open = useComposerStore((s) => s.isStickerPickerOpen);
  const setOpen = useComposerStore((s) => s.setStickerPickerOpen);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const clearReply = useComposerStore((s) => s.clearReply);
  const sendSticker = useSendStickerMessageMutation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;

  const handleSelect = (ref: ChatusStickerRef) => {
    if (disabled || sendSticker.isPending) return;
    sendSticker.mutate(
      {
        chatId,
        packId: ref.packId,
        stickerId: ref.stickerId,
        replyToId: replyToMessageId,
        clientTempId: crypto.randomUUID(),
      },
      {
        onSuccess: () => {
          clearReply();
          setOpen(false);
        },
      },
    );
  };

  return (
    <div className="sticker-picker" ref={panelRef} role="dialog" aria-label="Стикеры">
      <div className="sticker-picker__grid">
        {FRIEND_STICKER_ITEMS.map((item) => {
          const src = STICKER_URL_BY_ID[item.stickerId];
          if (!src) return null;
          return (
            <button
              key={item.stickerId}
              type="button"
              className="sticker-picker__item"
              aria-label={`Отправить стикер ${item.stickerId}`}
              disabled={disabled || sendSticker.isPending}
              onClick={() => handleSelect(item)}
            >
              <img src={src} alt="" className="sticker-picker__img" draggable={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

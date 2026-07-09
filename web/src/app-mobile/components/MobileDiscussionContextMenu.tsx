import { createPortal } from 'react-dom';
import type { MappedMessage } from '@/types/message';

interface MobileDiscussionContextMenuProps {
  message: MappedMessage | null;
  anchor: { x: number; y: number; width: number; height: number } | null;
  onClose: () => void;
  onReply: (messageId: string) => void;
  onCopy: (text: string) => void;
}

function getMobileAppPortalRoot(): HTMLElement {
  return document.querySelector('.mobile-app') ?? document.body;
}

export function MobileDiscussionContextMenu({
  message,
  anchor,
  onClose,
  onReply,
  onCopy,
}: MobileDiscussionContextMenuProps) {
  if (!message || !anchor) return null;

  const text = message.content?.trim() ?? '';
  const menuTop = Math.min(anchor.y + anchor.height + 6, window.innerHeight - 120);
  const menuLeft = Math.max(12, Math.min(anchor.x, window.innerWidth - 180));

  return createPortal(
    <div className="mobile-discussion-menu" role="presentation">
      <button type="button" className="mobile-discussion-menu__backdrop" onClick={onClose} aria-label="Закрыть" />
      <div
        className="mobile-discussion-menu__card"
        style={{ top: menuTop, left: menuLeft }}
        role="menu"
      >
        <button
          type="button"
          className="mobile-discussion-menu__action"
          role="menuitem"
          onClick={() => {
            onReply(message.id);
            onClose();
          }}
        >
          Ответить
        </button>
        <button
          type="button"
          className="mobile-discussion-menu__action"
          role="menuitem"
          disabled={!text}
          onClick={() => {
            if (!text) return;
            onCopy(text);
            onClose();
          }}
        >
          Скопировать
        </button>
      </div>
    </div>,
    getMobileAppPortalRoot(),
  );
}

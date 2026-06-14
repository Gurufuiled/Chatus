import { useEffect, useMemo } from 'react';
import { Avatar } from '@/components/avatar/Avatar';
import { useChatsQuery } from '@/queries/chats.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import './forward-dialog.css';

interface ForwardDialogProps {
  open: boolean;
  sourceChatId: string;
  pending?: boolean;
  onClose: () => void;
  onSelectChat: (targetChatId: string) => void;
}

export function ForwardDialog({
  open,
  sourceChatId,
  pending = false,
  onClose,
  onSelectChat,
}: ForwardDialogProps) {
  const { data: chats } = useChatsQuery();

  const targets = useMemo(
    () => (chats ?? []).filter((chat) => chat.id !== sourceChatId),
    [chats, sourceChatId],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="forward-dialog" role="dialog" aria-modal="true" aria-label="Переслать сообщение">
      <button type="button" className="forward-dialog__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="forward-dialog__panel">
        <h2 className="forward-dialog__title">Переслать в…</h2>
        <div className="forward-dialog__list">
          {targets.length === 0 ? (
            <p className="forward-dialog__empty">Пока нет других чатов для пересылки.</p>
          ) : (
            targets.map((chat) => {
              const name = getChatDisplayName(chat);
              return (
                <button
                  key={chat.id}
                  type="button"
                  className="forward-dialog__row"
                  disabled={pending}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <Avatar name={name} imageUrl={chat.avatar_url} size={40} />
                  <span className="forward-dialog__name">{name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { Avatar } from '@/components/avatar/Avatar';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import type { ChatSummary } from '@/types/chat';
import './delete-chat-dialog.css';

interface DeleteChatDialogProps {
  chat: ChatSummary;
  onClose: () => void;
  onConfirm: (scope: 'me' | 'all') => void;
  isPending?: boolean;
}

export function DeleteChatDialog({ chat, onClose, onConfirm, isPending = false }: DeleteChatDialogProps) {
  const displayName = getChatDisplayName(chat);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isPending]);

  const isPrivate = chat.chat_type === 'private';
  const deleteBothLabel = isPrivate
    ? `УДАЛИТЬ У СЕБЯ И У ${displayName.toUpperCase()}`
    : `УДАЛИТЬ ДЛЯ ВСЕХ`;

  return (
    <div className="delete-chat-dialog" role="dialog" aria-modal="true" aria-label="Удалить чат">
      <button 
        type="button" 
        className="delete-chat-dialog__backdrop" 
        aria-label="Закрыть" 
        onClick={isPending ? undefined : onClose} 
        disabled={isPending}
      />
      <div className="delete-chat-dialog__panel">
        <div className="delete-chat-dialog__header">
          <Avatar name={displayName} imageUrl={chat.avatar_url} size={36} />
          <h2 className="delete-chat-dialog__title">Удалить чат</h2>
        </div>
        <div className="delete-chat-dialog__body">
          <p className="delete-chat-dialog__description">
            {isPrivate
              ? `Удалить чат с ${displayName} без возможности восстановления?`
              : `Удалить чат ${displayName} без возможности восстановления?`}
          </p>
        </div>
        <div className="delete-chat-dialog__buttons">
          <button
            type="button"
            className="delete-chat-dialog__button delete-chat-dialog__button--danger"
            onClick={() => onConfirm('all')}
            disabled={isPending}
          >
            {isPending ? 'УДАЛЕНИЕ...' : deleteBothLabel}
          </button>
          <button
            type="button"
            className="delete-chat-dialog__button delete-chat-dialog__button--danger"
            onClick={() => onConfirm('me')}
            disabled={isPending}
          >
            {isPending ? 'УДАЛЕНИЕ...' : 'УДАЛИТЬ ТОЛЬКО У СЕБЯ'}
          </button>
          <button
            type="button"
            className="delete-chat-dialog__button delete-chat-dialog__button--cancel"
            onClick={onClose}
            disabled={isPending}
          >
            ОТМЕНА
          </button>
        </div>
      </div>
    </div>
  );
}


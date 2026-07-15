import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/avatar/Avatar';
import { useChatsQuery } from '@/queries/chats.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import './forward-dialog.css';

interface ForwardDialogProps {
  open: boolean;
  sourceChatId: string;
  pending?: boolean;
  onClose: () => void;
  onForward: (targetChatIds: string[], caption?: string) => void;
}

export function ForwardDialog({
  open,
  sourceChatId,
  pending = false,
  onClose,
  onForward,
}: ForwardDialogProps) {
  const { data: chats } = useChatsQuery();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIds([]);
    setCaption('');
  }, [open]);

  const targets = useMemo(() => {
    const list = (chats ?? []).filter((chat) => chat.id !== sourceChatId);
    const sorted = [...list].sort((a, b) => {
      const aTime = a.last_message_at ?? a.updated_at ?? 0;
      const bTime = b.last_message_at ?? b.updated_at ?? 0;
      return bTime - aTime;
    });
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((chat) => getChatDisplayName(chat).toLowerCase().includes(q));
  }, [chats, query, sourceChatId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toggleChat = (chatId: string) => {
    setSelectedIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId],
    );
  };

  const handleSend = () => {
    if (selectedIds.length === 0 || pending) return;
    onForward(selectedIds, caption.trim() || undefined);
  };

  return (
    <div className="forward-dialog" role="dialog" aria-modal="true" aria-label="Переслать сообщение">
      <button type="button" className="forward-dialog__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="forward-dialog__panel">
        <h2 className="forward-dialog__title">Переслать в…</h2>
        <div className="forward-dialog__search-wrap">
          <input
            type="search"
            className="forward-dialog__search"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="forward-dialog__list">
          {targets.length === 0 ? (
            <p className="forward-dialog__empty">
              {query.trim() ? 'Ничего не найдено' : 'Пока нет других чатов для пересылки.'}
            </p>
          ) : (
            targets.map((chat) => {
              const name = getChatDisplayName(chat);
              const selected = selectedIds.includes(chat.id);
              return (
                <button
                  key={chat.id}
                  type="button"
                  className={`forward-dialog__row${selected ? ' forward-dialog__row--selected' : ''}`}
                  disabled={pending}
                  aria-pressed={selected}
                  onClick={() => toggleChat(chat.id)}
                >
                  <span
                    className={`forward-dialog__check${selected ? ' forward-dialog__check--on' : ''}`}
                    aria-hidden
                  >
                    {selected ? '✓' : ''}
                  </span>
                  <Avatar name={name} imageUrl={chat.avatar_url} size={40} />
                  <span className="forward-dialog__row-text">
                    <span className="forward-dialog__name">{name}</span>
                    {chat.last_message_preview ? (
                      <span className="forward-dialog__meta">{chat.last_message_preview}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="forward-dialog__footer">
          <input
            type="text"
            className="forward-dialog__caption"
            placeholder="Подпись (необязательно)"
            value={caption}
            disabled={pending || selectedIds.length === 0}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            className="forward-dialog__send"
            disabled={pending || selectedIds.length === 0}
            onClick={handleSend}
          >
            {pending
              ? 'Отправка…'
              : selectedIds.length > 0
                ? `Переслать (${selectedIds.length})`
                : 'Переслать'}
          </button>
        </div>
      </div>
    </div>
  );
}

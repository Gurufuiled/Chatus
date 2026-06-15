import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { useComposerStore } from '@/stores/composerStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useChatsQuery } from '@/queries/chats.queries';
import { usePinMessageMutation, useDeleteMessageMutation, useMessagesQuery, useToggleReactionMutation } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { isChatusStickerMessage } from '@/utils/stickerPayload';
import { canForwardMessage } from '@/utils/forwardPayload';
import { useFloatingMenuPosition } from '@/hooks/useFloatingMenuPosition';
import type { MappedMessage } from '@/types/message';
import './message-context-menu.css';

const REACTIONS = ['❤️', '🥳', '🥰', '👍', '😢', '👎', '😭'];

interface MessageContextMenuProps {
  chatId: string;
  boundsRef?: RefObject<HTMLElement | null>;
  onForward: (messageIds: string[]) => void;
}

function getCopyableText(message: MappedMessage | undefined): string {
  if (!message || message.msg_type !== 'text' || !message.content) return '';
  if (isChatusStickerMessage(message.content)) return '';
  return message.content.trim();
}

function ReplyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 17v5M8 3h8l-1 5 3 2-1 3H7l-1-3 3-2-1-5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M15 10l5-5-5-5M20 5H9a4 4 0 00-4 4v2M9 14l-5 5 5 5M4 19h11a4 4 0 004-4v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12.5l2.5 2.5L16 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MessageContextMenu({ chatId, boundsRef, onForward }: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const menuChatId = useMessageContextStore((s) => s.chatId);
  const messageId = useMessageContextStore((s) => s.messageId);
  const position = useMessageContextStore((s) => s.position);
  const mode = useMessageContextStore((s) => s.mode);
  const closeMessageMenu = useMessageContextStore((s) => s.closeMessageMenu);
  const setMenuMode = useMessageContextStore((s) => s.setMenuMode);
  const setReply = useComposerStore((s) => s.setReply);
  const requestComposerFocus = useComposerStore((s) => s.requestComposerFocus);
  const setComposerError = useComposerStore((s) => s.setComposerError);
  const enterSelection = useSelectionStore((s) => s.enterSelection);

  const { data: chats } = useChatsQuery();
  const { data: messages } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const pinMutation = usePinMessageMutation();
  const deleteMutation = useDeleteMessageMutation();
  const toggleReaction = useToggleReactionMutation();

  const open = menuChatId === chatId && !!messageId && !!position;
  const message = messages?.find((m) => m.id === messageId);
  const chat = chats?.find((c) => c.id === chatId);
  const peerName = chat ? getChatDisplayName(chat) : 'собеседника';
  const isGroup = chat?.chat_type !== 'private';
  const isOwnMessage = !!me?.id && message?.sender_id === me.id;
  const copyableText = getCopyableText(message);
  const canForward = message ? canForwardMessage(message) : false;
  const isPinned = chat?.pinned_message_id === messageId;

  const { left, top, maxHeight, ready } = useFloatingMenuPosition({
    open,
    anchor: position,
    menuRef: ref,
    boundsRef,
    deps: [mode, messageId, copyableText, isOwnMessage, isPinned],
  });

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMessageMenu();
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open, closeMessageMenu]);

  if (!open || !position || !message) return null;

  const handleReply = () => {
    setReply(chatId, message.id);
    requestComposerFocus();
    closeMessageMenu();
  };

  const handleCopy = async () => {
    if (!copyableText) return;
    try {
      await navigator.clipboard.writeText(copyableText);
    } catch {
      setComposerError(chatId, 'Не удалось скопировать текст');
    }
    closeMessageMenu();
  };

  const handlePin = () => {
    pinMutation.mutate({
      chatId,
      messageId: isPinned ? null : message.id,
    });
    closeMessageMenu();
  };

  const handleForward = () => {
    onForward([message.id]);
    closeMessageMenu();
  };

  const handleSelect = () => {
    enterSelection(chatId, message.id);
    closeMessageMenu();
  };

  const handleDeleteForAll = () => {
    deleteMutation.mutate({
      chatId,
      messageId: message.id,
      scope: 'all',
    });
    closeMessageMenu();
  };

  const handleDeleteForMe = () => {
    deleteMutation.mutate({
      chatId,
      messageId: message.id,
      scope: 'me',
    });
    closeMessageMenu();
  };

  const handleReaction = (emoji: string) => {
    if (toggleReaction.isPending) return;
    toggleReaction.mutate(
      { chatId, messageId: message.id, emoji },
      { onSettled: () => closeMessageMenu() },
    );
  };

  const actionItems = [
    {
      id: 'reply',
      label: 'Ответить',
      icon: <ReplyIcon />,
      onClick: handleReply,
    },
    ...(copyableText
      ? [
          {
            id: 'copy',
            label: 'Копировать текст',
            icon: <CopyIcon />,
            onClick: () => void handleCopy(),
          },
        ]
      : []),
    {
      id: 'pin',
      label: isPinned ? 'Открепить' : 'Закрепить',
      icon: <PinIcon />,
      onClick: handlePin,
    },
    {
      id: 'forward',
      label: 'Переслать',
      icon: <ForwardIcon />,
      onClick: handleForward,
      disabled: !canForward,
    },
    {
      id: 'select',
      label: 'Выбрать',
      icon: <SelectIcon />,
      onClick: handleSelect,
    },
    ...(isOwnMessage
      ? [
          {
            id: 'delete',
            label: 'Удалить',
            icon: <DeleteIcon />,
            danger: true,
            onClick: () => setMenuMode('delete'),
          },
        ]
      : []),
  ];

  const deleteItems = isGroup
    ? [
        { id: 'delete-me', label: 'Удалить у меня', onClick: handleDeleteForMe },
        { id: 'delete-all', label: 'Удалить у всех', onClick: handleDeleteForAll, danger: true },
      ]
    : [
        { id: 'delete-me', label: 'Удалить у меня', onClick: handleDeleteForMe },
        {
          id: 'delete-both',
          label: `Удалить у меня и у ${peerName}`,
          onClick: handleDeleteForAll,
          danger: true,
        },
      ];

  const menu = (
    <div
      ref={ref}
      className={`message-context-menu${ready ? '' : ' message-context-menu--measuring'}`}
      style={{ left, top, maxHeight }}
      role="menu"
    >
      {mode === 'actions' ? (
        <>
          <div className="message-context-menu__reactions" role="toolbar" aria-label="Реакции">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="message-context-menu__reaction"
                aria-label={`Реакция ${emoji}`}
                disabled={toggleReaction.isPending}
                onClick={() => handleReaction(emoji)}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className="message-context-menu__reaction message-context-menu__reaction--more"
              aria-label="Больше реакций"
              disabled
              title="Скоро"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="message-context-menu__actions">
            {actionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`message-context-menu__item${item.danger ? ' message-context-menu__item--danger' : ''}`}
                disabled={item.disabled}
                onClick={item.onClick}
              >
                <span className="message-context-menu__icon">{item.icon}</span>
                <span className="message-context-menu__label">{item.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="message-context-menu__delete-panel">
          {deleteItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`message-context-menu__delete-item${item.danger ? ' message-context-menu__delete-item--danger' : ''}`}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="message-context-menu__delete-cancel"
            onClick={() => setMenuMode('actions')}
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}

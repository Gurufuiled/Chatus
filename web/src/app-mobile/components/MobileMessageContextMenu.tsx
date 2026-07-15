import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { useComposerStore } from '@/stores/composerStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useChatsQuery } from '@/queries/chats.queries';
import {
  usePinMessageMutation,
  useDeleteMessageMutation,
  useMessagesQuery,
  useToggleReactionMutation,
} from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { isChatusStickerMessage } from '@/utils/stickerPayload';
import { canForwardMessage } from '@/utils/forwardPayload';
import {
  canPinMessages,
  canSaveOrForwardContent,
  restrictSavingReason,
} from '@/utils/chatPermissions';
import { isTempMessageId } from '@/features/conversation/messageFormatters';
import { PinConfirmDialog } from '@/features/conversation/PinConfirmDialog';
import { MobileMessageBubble } from './MobileMessageBubble';
import type { MappedMessage } from '@/types/message';

const REACTIONS = ['❤️', '👏', '😭', '🥰', '💋', '🤣', '👍'];
const MENU_WIDTH = 220;
const MENU_EDGE_GAP = 12;
const MENU_GAP = 4;

function getMobileAppPortalRoot(): HTMLElement {
  return document.querySelector('.mobile-app') ?? document.body;
}

interface MobileMessageContextMenuProps {
  chatId: string;
  onForward: (messageIds: string[]) => void;
}

function getCopyableText(message: MappedMessage | undefined): string {
  if (!message || message.msg_type !== 'text' || !message.content) return '';
  if (isChatusStickerMessage(message.content)) return '';
  if (message.content.startsWith('chatus:poll:')) return '';
  return message.content.trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ReplyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
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
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
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
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
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
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12.5l2.5 2.5L16 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
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

export function MobileMessageContextMenu({ chatId, onForward }: MobileMessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
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
  const [pinConfirmMessageId, setPinConfirmMessageId] = useState<string | null>(null);

  const open = menuChatId === chatId && !!messageId && !!position;
  const message = messages?.find((m) => m.id === messageId);
  const chat = chats?.find((c) => c.id === chatId);
  const peerName = chat ? getChatDisplayName(chat) : 'собеседника';
  const isGroup = chat?.chat_type !== 'private';
  const isOwnMessage = !!me?.id && message?.sender_id === me.id;
  const isOutgoing = position?.isOutgoing ?? isOwnMessage;
  const copyableText = getCopyableText(message);
  const allowSaveOrForward = canSaveOrForwardContent(chat, me);
  const canForward = !!message && canForwardMessage(message) && allowSaveOrForward;
  const forwardBlockedReason = !allowSaveOrForward ? restrictSavingReason() : undefined;
  const canPin = canPinMessages(chat, me);
  const canReact = message
    ? message.status !== 'sending' &&
      message.status !== 'error' &&
      !isTempMessageId(message.id)
    : false;
  const isPinned = chat?.pinned_message_id === messageId;
  const showReactions = !(
    message?.msg_type === 'text' &&
    message?.is_deleted !== true &&
    message?.content &&
    isChatusStickerMessage(message.content)
  );

  const [layout, setLayout] = useState({ left: 0, top: 0, ready: false });

  useLayoutEffect(() => {
    if (!open || !position || !menuRef.current) {
      setLayout({ left: 0, top: 0, ready: false });
      return;
    }

    const menuHeight = menuRef.current.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const anchorTop = position.height != null ? position.y : position.y;
    const anchorBottom = position.height != null ? position.y + position.height : position.y;
    const anchorLeft = position.width != null ? position.x : position.x - (position.width ?? 0) / 2;
    const anchorWidth = position.width ?? 0;

    const menuLeftBase = isOutgoing
      ? anchorLeft + anchorWidth - MENU_WIDTH
      : anchorLeft;
    const left = clamp(menuLeftBase, MENU_EDGE_GAP, viewportWidth - MENU_WIDTH - MENU_EDGE_GAP);

    let top = anchorBottom + MENU_GAP;
    if (top + menuHeight > viewportHeight - MENU_EDGE_GAP) {
      top = Math.max(MENU_EDGE_GAP, anchorTop - menuHeight - MENU_GAP);
    }

    setLayout({ left, top, ready: true });
  }, [open, position, mode, messageId, copyableText, isOwnMessage, isPinned, isOutgoing, showReactions]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMessageMenu();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeMessageMenu]);

  const handlePinConfirm = (notify: boolean) => {
    if (!pinConfirmMessageId) return;
    pinMutation.mutate(
      { chatId, messageId: pinConfirmMessageId, notify },
      { onSettled: () => setPinConfirmMessageId(null) },
    );
  };

  const pinDialog = (
    <PinConfirmDialog
      open={!!pinConfirmMessageId}
      pending={pinMutation.isPending}
      onClose={() => setPinConfirmMessageId(null)}
      onConfirm={handlePinConfirm}
    />
  );

  if (!open || !position || !message) {
    return pinDialog;
  }

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
    if (!canPin) return;
    if (isPinned) {
      pinMutation.mutate({ chatId, messageId: null });
      closeMessageMenu();
      return;
    }
    setPinConfirmMessageId(message.id);
    closeMessageMenu();
  };

  const handleForward = () => {
    if (!canForward) return;
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
    if (!canReact || toggleReaction.isPending) return;
    toggleReaction.mutate(
      { chatId, messageId: message.id, emoji },
      { onSettled: () => closeMessageMenu() },
    );
  };

  const actionItems = [
    { id: 'reply', label: 'Ответить', icon: <ReplyIcon />, onClick: handleReply },
    ...(copyableText && allowSaveOrForward
      ? [{ id: 'copy', label: 'Копировать', icon: <CopyIcon />, onClick: () => void handleCopy() }]
      : []),
    {
      id: 'pin',
      label: isPinned ? 'Открепить' : 'Закрепить',
      icon: <PinIcon />,
      onClick: handlePin,
      disabled: !canPin,
      title: !canPin ? 'Недостаточно прав для закрепления' : undefined,
    },
    {
      id: 'forward',
      label: 'Переслать',
      icon: <ForwardIcon />,
      onClick: handleForward,
      disabled: !canForward,
      title: forwardBlockedReason,
    },
    { id: 'select', label: 'Выбрать', icon: <SelectIcon />, onClick: handleSelect },
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

  const overlay = (
    <div className="mobile-message-menu" role="presentation">
      {/* Layer 1: blur + dim — sibling only, never wraps preview/panel */}
      <button
        type="button"
        className="mobile-message-menu__backdrop"
        aria-label="Закрыть меню"
        onClick={closeMessageMenu}
      />
      {/* Layer 2: sharp message clone above backdrop */}
      <div
        className="mobile-message-menu__preview"
        style={{
          top: position.y,
          left: position.x,
          width: position.width ?? undefined,
          height: position.height ?? undefined,
        }}
        aria-hidden
      >
        <div className="mobile-message-menu__preview-inner">
          <MobileMessageBubble chatId={chatId} message={message} isOutgoing={isOutgoing} />
        </div>
      </div>
      {/* Layer 3: solid menu panel above preview */}
      <div
        ref={menuRef}
        className={`mobile-message-menu__panel${layout.ready ? '' : ' mobile-message-menu__panel--measuring'}`}
        style={{ left: layout.left, top: layout.top, width: MENU_WIDTH }}
        role="menu"
      >
        {mode === 'actions' ? (
          <>
            {showReactions ? (
              <div className="mobile-message-menu__reactions" role="toolbar" aria-label="Реакции">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="mobile-message-menu__reaction"
                    aria-label={`Реакция ${emoji}`}
                    disabled={!canReact || toggleReaction.isPending}
                    onClick={() => handleReaction(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mobile-message-menu__actions">
              {actionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`mobile-message-menu__item${item.danger ? ' mobile-message-menu__item--danger' : ''}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={item.onClick}
                >
                  <span className="mobile-message-menu__item-label">{item.label}</span>
                  <span className="mobile-message-menu__item-icon">{item.icon}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mobile-message-menu__delete">
            {deleteItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`mobile-message-menu__delete-item${item.danger ? ' mobile-message-menu__delete-item--danger' : ''}`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="mobile-message-menu__delete-cancel"
              onClick={() => setMenuMode('actions')}
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {createPortal(overlay, getMobileAppPortalRoot())}
      {pinDialog}
    </>
  );
}

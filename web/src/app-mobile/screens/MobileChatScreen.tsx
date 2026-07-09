import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import {
  useForwardMessagesMutation,
  useMarkChatReadMutation,
  useMessagesQuery,
} from '@/queries/messages.queries';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import { ForwardDialog } from '@/features/conversation/ForwardDialog';
import { MobileChatHeader } from '../components/MobileChatHeader';
import { MobileMessageList } from '../components/MobileMessageList';
import { MobileMessageComposer } from '../components/MobileMessageComposer';
import { MobileMessageContextMenu } from '../components/MobileMessageContextMenu';
import { useMobileComposerKeyboard } from '../utils/useMobileComposerKeyboard';

interface MobileChatScreenProps {
  chatId: string;
}

export function MobileChatScreen({ chatId }: MobileChatScreenProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading: chatsLoading } = useChatsQuery();
  const { isLoading: messagesLoading } = useMessagesQuery(chatId);
  const { mutate: markChatRead } = useMarkChatReadMutation();
  const forwardMutation = useForwardMessagesMutation();
  const markedRef = useRef<string | null>(null);
  const chat = chats?.find((c) => c.id === chatId);

  useEffect(() => {
    if (!chat || chat.chat_type !== 'channel') return;
    navigate({ to: '/channel/$channelId', params: { channelId: chat.id }, replace: true });
  }, [chat, navigate]);
  const { keyboardLift, composerPaddingBottom } = useMobileComposerKeyboard();
  const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
  const closeForward = useCallback(() => setForwardMessageIds([]), []);

  const handleForwardToChat = useCallback(
    (targetChatId: string) => {
      if (forwardMessageIds.length === 0) return;
      forwardMutation.mutate(
        {
          sourceChatId: chatId,
          targetChatId,
          messageIds: forwardMessageIds,
        },
        { onSuccess: closeForward },
      );
    },
    [chatId, closeForward, forwardMessageIds, forwardMutation],
  );

  useEffect(() => {
    markedRef.current = null;
  }, [chatId]);

  useEffect(() => {
    if (!chat || chat.unread_count === 0) return;
    if (markedRef.current === chatId) return;
    markedRef.current = chatId;
    markChatRead(chatId);
  }, [chatId, chat, markChatRead]);

  if (chatsLoading) {
    return (
      <div
        className="mobile-chat"
        style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
      >
        <div className="mobile-chat__messages-loading">Загрузка…</div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div
        className="mobile-chat"
        style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
      >
        <header className="mobile-chat__header">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад к списку чатов"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat__title">Чат не найден</span>
        </header>
        <p className="mobile-chat__messages-empty">Возможно, диалог был удалён</p>
      </div>
    );
  }

  return (
    <div
      className="mobile-chat"
      style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <MobileChatHeader chat={chat} />
      <MobileMessageList chatId={chatId} keyboardLift={keyboardLift} isGroupChat={chat.chat_type === 'group'} />
      <MobileMessageComposer
        chatId={chatId}
        disabled={messagesLoading}
        keyboardLift={keyboardLift}
        composerPaddingBottom={composerPaddingBottom}
      />
      <MobileMessageContextMenu
        chatId={chatId}
        onForward={(messageIds) => setForwardMessageIds(messageIds)}
      />
      <ForwardDialog
        open={forwardMessageIds.length > 0}
        sourceChatId={chatId}
        pending={forwardMutation.isPending}
        onClose={closeForward}
        onSelectChat={handleForwardToChat}
      />
    </div>
  );
}

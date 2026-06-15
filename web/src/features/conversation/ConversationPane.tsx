import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import {
  useDeleteMessageMutation,
  useForwardMessagesMutation,
  useMarkChatReadMutation,
  useMessagesQuery,
} from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useSelectionStore } from '@/stores/selectionStore';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { ConversationDropZone } from './ConversationDropZone';
import { MessageContextMenu } from './MessageContextMenu';
import { ForwardDialog } from './ForwardDialog';
import { MessageSelectionToolbar } from './MessageSelectionToolbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useGlobalEscape } from '@/hooks/useGlobalEscape';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import './conversation.css';

interface ConversationPaneProps {
  chatId: string;
}

export function ConversationPane({ chatId }: ConversationPaneProps) {
  const { data: chats } = useChatsQuery();
  const { data: messages, isLoading: messagesLoading } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const markRead = useMarkChatReadMutation();
  const forwardMutation = useForwardMessagesMutation();
  const deleteMutation = useDeleteMessageMutation();
  const exitSelection = useSelectionStore((s) => s.exitSelection);
  const markedRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chat = chats?.find((c) => c.id === chatId);

  const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
  const closeForward = useCallback(() => setForwardMessageIds([]), []);

  useGlobalEscape({
    forwardOpen: forwardMessageIds.length > 0,
    onCloseForward: closeForward,
  });

  useEffect(() => {
    markedRef.current = null;
    exitSelection();
    setForwardMessageIds([]);
  }, [chatId, exitSelection]);

  useEffect(() => {
    if (!chat || chat.unread_count === 0) return;
    if (markedRef.current === chatId) return;
    markedRef.current = chatId;
    markRead.mutate(chatId);
  }, [chatId, chat?.unread_count, markRead, chat]);

  const handleForwardRequest = useCallback((messageIds: string[]) => {
    setForwardMessageIds(messageIds);
  }, []);

  const handleForwardToChat = useCallback(
    (targetChatId: string) => {
      if (forwardMessageIds.length === 0) return;
      forwardMutation.mutate(
        {
          sourceChatId: chatId,
          targetChatId,
          messageIds: forwardMessageIds,
        },
        {
          onSuccess: () => {
            setForwardMessageIds([]);
            exitSelection();
          },
        },
      );
    },
    [chatId, exitSelection, forwardMessageIds, forwardMutation],
  );

  const handleBatchDelete = useCallback(
    (messageIds: string[]) => {
      const list = messages ?? [];
      for (const messageId of messageIds) {
        const message = list.find((m) => m.id === messageId);
        const scope =
          message && me?.id && message.sender_id === me.id ? 'all' : 'me';
        deleteMutation.mutate({ chatId, messageId, scope });
      }
      exitSelection();
    },
    [chatId, deleteMutation, exitSelection, me?.id, messages],
  );

  if (!chat) {
    return (
      <EmptyState
        title="Чат не найден"
        description="Возможно, диалог был удалён"
      />
    );
  }

  return (
    <div className="conversation-pane">
      <div className="conversation-pane__header-wrap">
        <Link to="/" className="conversation-pane__back" aria-label="Назад к списку чатов">
          ←
        </Link>
        <ConversationHeader chat={chat} />
      </div>
      <ConversationDropZone chatId={chatId} disabled={messagesLoading}>
        <div
          ref={bodyRef}
          className="conversation-pane__body"
          style={{ ['--chat-wallpaper-pattern' as string]: `url(${wallpaperUrl})` }}
        >
          <MessageList chatId={chatId} />
          <MessageSelectionToolbar
            chatId={chatId}
            onForward={handleForwardRequest}
            onDelete={handleBatchDelete}
          />
          <MessageComposer chatId={chatId} disabled={messagesLoading} />
        </div>
      </ConversationDropZone>
      <MessageContextMenu
        chatId={chatId}
        boundsRef={bodyRef as RefObject<HTMLElement | null>}
        onForward={handleForwardRequest}
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

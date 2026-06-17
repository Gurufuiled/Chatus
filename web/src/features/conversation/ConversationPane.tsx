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
import { ChatInfoSidebar } from './ChatInfoSidebar';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const closeForward = useCallback(() => setForwardMessageIds([]), []);

  useGlobalEscape({
    forwardOpen: forwardMessageIds.length > 0,
    onCloseForward: closeForward,
  });

  useEffect(() => {
    markedRef.current = null;
    exitSelection();
    setForwardMessageIds([]);
    setIsSidebarOpen(false);
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
    <div className="conversation-container" style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div className="conversation-pane" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="conversation-pane__header-wrap">
          <Link to="/" className="conversation-pane__back" aria-label="Назад к списку чатов">
            ←
          </Link>
          <ConversationHeader chat={chat} onClick={() => setIsSidebarOpen((prev) => !prev)} />
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
      {isSidebarOpen ? (
        <ChatInfoSidebar chat={chat} onClose={() => setIsSidebarOpen(false)} />
      ) : null}
    </div>
  );
}

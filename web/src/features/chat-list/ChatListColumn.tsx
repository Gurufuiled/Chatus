import { useMemo } from 'react';
import { ContextMenu } from '@/components/menus/ContextMenu';
import {
  useChatsQuery,
  useDeleteChatMutation,
  useMuteChatMutation,
  usePinChatMutation,
} from '@/queries/chats.queries';
import { useMenuStore } from '@/stores/menuStore';
import { useChatUiStore } from '@/stores/chatUiStore';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChatListHeader } from './ChatListHeader';
import { ChatListItem } from './ChatListItem';
import './chat-list.css';

interface ChatListColumnProps {
  activeChatId?: string;
}

export function ChatListColumn({ activeChatId }: ChatListColumnProps) {
  const { data: chats, isLoading, isError, error } = useChatsQuery();
  const searchQuery = useChatUiStore((s) => s.searchQuery);
  const chatMenuChatId = useMenuStore((s) => s.chatMenuChatId);
  const chatMenuPosition = useMenuStore((s) => s.chatMenuPosition);
  const closeChatMenu = useMenuStore((s) => s.closeChatMenu);

  const muteMutation = useMuteChatMutation();
  const pinMutation = usePinChatMutation();
  const deleteMutation = useDeleteChatMutation();

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => {
      const name =
        chat.chat_type === 'private'
          ? (chat.peer_display_name ?? chat.name ?? '')
          : (chat.name ?? '');
      return name.toLowerCase().includes(q);
    });
  }, [chats, searchQuery]);

  const menuChat = chats?.find((c) => c.id === chatMenuChatId);

  const menuItems = menuChat
    ? [
        {
          id: 'mute',
          label: menuChat.is_muted ? 'Unmute' : 'Mute',
          onSelect: () =>
            muteMutation.mutate({ chatId: menuChat.id, muted: !menuChat.is_muted }),
        },
        {
          id: 'pin',
          label: menuChat.is_pinned ? 'Unpin' : 'Pin',
          onSelect: () =>
            pinMutation.mutate({ chatId: menuChat.id, pinned: !menuChat.is_pinned }),
        },
        {
          id: 'delete-me',
          label: 'Delete for me',
          danger: true,
          disabled: menuChat.chat_type === 'private',
          onSelect: () => deleteMutation.mutate({ chatId: menuChat.id, scope: 'me' }),
        },
        {
          id: 'delete-all',
          label: 'Delete for both',
          danger: true,
          onSelect: () => deleteMutation.mutate({ chatId: menuChat.id, scope: 'all' }),
        },
      ]
    : [];

  return (
    <div className="chat-list-column">
      <ChatListHeader />
      <div className="chat-list-column__scroll">
        {isLoading ? <Spinner label="Loading chats" /> : null}
        {isError ? (
          <EmptyState
            title="Не удалось загрузить чаты"
            description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
          />
        ) : null}
        {!isLoading && !isError && filteredChats.length === 0 ? (
          <EmptyState
            title="Пока нет чатов"
            description="Начните переписку в мобильном приложении ChatUs — здесь появятся ваши диалоги"
          />
        ) : null}
        {filteredChats.map((chat) => (
          <ChatListItem key={chat.id} chat={chat} active={chat.id === activeChatId} />
        ))}
      </div>
      <ContextMenu
        open={!!chatMenuChatId && !!chatMenuPosition}
        x={chatMenuPosition?.x ?? 0}
        y={chatMenuPosition?.y ?? 0}
        items={menuItems}
        onClose={closeChatMenu}
      />
    </div>
  );
}

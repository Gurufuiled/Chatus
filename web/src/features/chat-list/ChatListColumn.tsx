import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ContextMenu } from '@/components/menus/ContextMenu';
import {
  useChatsQuery,
  useCreatePrivateChatMutation,
  useDeleteChatMutation,
  useMuteChatMutation,
  usePinChatMutation,
} from '@/queries/chats.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useMenuStore } from '@/stores/menuStore';
import { useChatUiStore } from '@/stores/chatUiStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChatListHeader } from './ChatListHeader';
import { ChatListItem } from './ChatListItem';
import { UserSearchResultItem } from './UserSearchResultItem';
import type { AuthUser } from '@/types/auth';
import './chat-list.css';

const SEARCH_DEBOUNCE_MS = 300;

interface ChatListColumnProps {
  activeChatId?: string;
}

export function ChatListColumn({ activeChatId }: ChatListColumnProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading, isError, error } = useChatsQuery();
  const { data: me } = useMeQuery();
  const searchQuery = useChatUiStore((s) => s.searchQuery);
  const trimmedSearchQuery = searchQuery.trim();
  const debouncedSearchQuery = useDebouncedValue(trimmedSearchQuery, SEARCH_DEBOUNCE_MS);
  const isSearchActive = trimmedSearchQuery.length > 0;
  const isSearchPending = isSearchActive && debouncedSearchQuery !== trimmedSearchQuery;

  const {
    data: userResults,
    isFetching: isUserSearchFetching,
    isError: isUserSearchError,
    error: userSearchError,
  } = useUserSearchQuery(debouncedSearchQuery);

  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [createChatError, setCreateChatError] = useState<string | null>(null);

  useEffect(() => {
    setCreateChatError(null);
  }, [trimmedSearchQuery]);

  const chatMenuChatId = useMenuStore((s) => s.chatMenuChatId);
  const chatMenuPosition = useMenuStore((s) => s.chatMenuPosition);
  const closeChatMenu = useMenuStore((s) => s.closeChatMenu);

  const muteMutation = useMuteChatMutation();
  const pinMutation = usePinChatMutation();
  const deleteMutation = useDeleteChatMutation();
  const createChatMutation = useCreatePrivateChatMutation();

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    if (!isSearchActive) return chats;
    const q = debouncedSearchQuery.toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => {
      const name =
        chat.chat_type === 'private'
          ? (chat.peer_display_name ?? chat.name ?? '')
          : (chat.name ?? '');
      return name.toLowerCase().includes(q);
    });
  }, [chats, debouncedSearchQuery, isSearchActive]);

  const filteredUsers = useMemo(() => {
    if (!isSearchActive || isSearchPending || !userResults) return [];
    return userResults.filter((user) => user.id !== me?.id);
  }, [isSearchActive, isSearchPending, me?.id, userResults]);

  const isSearchingUsers = isSearchActive && (isSearchPending || isUserSearchFetching);

  const handleSelectUser = (user: AuthUser) => {
    if (
      !user.id.trim() ||
      creatingUserId === user.id ||
      createChatMutation.isPending
    ) {
      return;
    }
    setCreatingUserId(user.id);
    setCreateChatError(null);
    createChatMutation.mutate(user.id, {
      onSuccess: (chat) => {
        navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
      },
      onError: (err) => {
        setCreateChatError(err instanceof Error ? err.message : 'Не удалось открыть чат');
      },
      onSettled: () => {
        setCreatingUserId(null);
      },
    });
  };

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

  const showDefaultEmpty =
    !isLoading && !isError && !isSearchActive && filteredChats.length === 0;

  const showSearchEmpty =
    isSearchActive &&
    !isLoading &&
    !isError &&
    !isSearchingUsers &&
    !isUserSearchError &&
    filteredChats.length === 0 &&
    filteredUsers.length === 0;

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
        {showDefaultEmpty ? (
          <EmptyState
            title="Пока нет чатов"
            description="Начните переписку в мобильном приложении ChatUs — здесь появятся ваши диалоги"
          />
        ) : null}
        {isSearchActive && filteredChats.length > 0 ? (
          <h2 className="chat-list-section-title">Чаты</h2>
        ) : null}
        {filteredChats.map((chat) => (
          <ChatListItem key={chat.id} chat={chat} active={chat.id === activeChatId} />
        ))}
        {isSearchingUsers ? <Spinner label="Searching users" /> : null}
        {isUserSearchError ? (
          <EmptyState
            title="Не удалось найти пользователей"
            description={
              userSearchError instanceof Error ? userSearchError.message : 'Неизвестная ошибка'
            }
          />
        ) : null}
        {createChatError ? (
          <EmptyState title="Не удалось открыть чат" description={createChatError} />
        ) : null}
        {filteredUsers.length > 0 ? (
          <h2 className="chat-list-section-title">Контакты</h2>
        ) : null}
        {filteredUsers.map((user) => (
          <UserSearchResultItem
            key={user.id}
            user={user}
            disabled={creatingUserId === user.id}
            onSelect={handleSelectUser}
          />
        ))}
        {showSearchEmpty ? (
          <EmptyState
            title="Никого не найдено"
            description="Попробуйте имя, @username или ник"
          />
        ) : null}
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

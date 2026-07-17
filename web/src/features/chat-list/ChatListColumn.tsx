import { DeleteChatDialog } from './DeleteChatDialog';
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
import { usePeerContactsMap } from '@/queries/peerContacts.queries';
import {
  formatPeerLocalDisplayName,
  getPrivateChatPeerUserId,
} from '@/features/contacts/peerContactDisplay';
import { getChatDisplayName } from './chatListFormatters';
import { useMenuStore } from '@/stores/menuStore';
import { useChatUiStore } from '@/stores/chatUiStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChatListHeader } from './ChatListHeader';
import { ChatListItem } from './ChatListItem';
import { UserSearchResultItem } from './UserSearchResultItem';
import { DeleteIcon, MuteIcon, PinIcon } from './ChatListContextMenuIcons';
import type { AuthUser } from '@/types/auth';
import type { ChatSummary } from '@/types/chat';
import './chat-list.css';

const SEARCH_DEBOUNCE_MS = 300;

interface ChatListColumnProps {
  activeChatId?: string;
}

export function ChatListColumn({ activeChatId }: ChatListColumnProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading, isError, error } = useChatsQuery();
  const { data: me } = useMeQuery();
  const peerContacts = usePeerContactsMap();
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
  const [deletingChat, setDeletingChat] = useState<ChatSummary | null>(null);

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
      const peerId = getPrivateChatPeerUserId(chat, me?.id);
      const localName = peerId
        ? formatPeerLocalDisplayName(peerContacts.get(peerId))
        : null;
      const name = getChatDisplayName(chat, localName);
      return name.toLowerCase().includes(q);
    });
  }, [chats, debouncedSearchQuery, isSearchActive, me?.id, peerContacts]);

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
          id: 'pin',
          label: menuChat.is_pinned ? 'Открепить' : 'Закрепить',
          icon: <PinIcon pinned={menuChat.is_pinned} />,
          onSelect: () =>
            pinMutation.mutate({ chatId: menuChat.id, pinned: !menuChat.is_pinned }),
        },
        {
          id: 'mute',
          label: menuChat.is_muted ? 'Включить уведомления' : 'Отключить уведомления',
          icon: <MuteIcon muted={menuChat.is_muted} />,
          onSelect: () =>
            muteMutation.mutate({ chatId: menuChat.id, muted: !menuChat.is_muted }),
        },
        {
          id: 'delete-chat',
          label: 'Удалить чат',
          icon: <DeleteIcon />,
          dangerStrong: true,
          onSelect: () => setDeletingChat(menuChat),
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
            description="Нажмите значок карандаша сверху, чтобы написать сообщение или создать группу"
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
      {deletingChat ? (
        <DeleteChatDialog
          chat={deletingChat}
          isPending={deleteMutation.isPending}
          onClose={() => setDeletingChat(null)}
          onConfirm={(scope) => {
            deleteMutation.mutate(
              { chatId: deletingChat.id, scope },
              {
                onSuccess: () => {
                  setDeletingChat(null);
                },
              }
            );
          }}
        />
      ) : null}
    </div>
  );
}

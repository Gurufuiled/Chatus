import React from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatListActionsMenu, ChatListRow, ChatListSkeleton, type ChatListMenuState } from '../components';
import { TelegramDialogListRow } from '../components/TelegramDialogListRow';
import { TelegramDialogsLoadingBanner } from '../components/TelegramDialogsLoadingBanner';
import { resolveAvatarUrl } from '../config';
import { ChatDao } from '../db/dao/ChatDao';
import type { ChatsStackParamList } from '../navigation/types';
import { computeChatListMenuPosition, getChatListTitle } from '../presentation';
import type { ApiUser } from '../services/AuthService';
import { createOrFindChat } from '../services/chatService';
import { tdlibToggleChatIsPinned } from './telegramChat/tdlibChatActions';
import { searchChannels } from '../services/channelService';
import { searchUsers } from '../services/profileService';
import { authStore } from '../stores/authStore';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { uiStore } from '../stores/uiStore';
import { messageStore } from '../stores/messageStore';
import type { Chat } from '../stores/types';
import { ChatListSearchBar } from '../components/ChatListSearchBar';
import { useTheme } from '../contexts/ThemeContext';
import { createChatListStyles, type ChatListStyleSet } from './chatList.styles';
import { matchesDialogQuery } from './telegramChat/telegramDialogsLoader';
import { useTelegramDialogsRefresh } from './telegramChat/useTelegramDialogsRefresh';
import { mergeUnifiedChatList, type ChatListItem } from './telegramChat/unifiedChatList';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatList'>;

const SEARCH_DEBOUNCE_MS = 300;

function ChatSeparator({ listStyles }: { listStyles: ChatListStyleSet }) {
  return <View style={listStyles.separator} />;
}

function isChannelPreviewRequired(channel: Chat, currentUserId: string | null) {
  if (channel.chat_type !== 'channel') return false;
  if (channel.created_by && channel.created_by === currentUserId) return false;
  return channel.access_status !== 'active';
}

function sortChatsByPinnedAndTime(chats: Chat[]) {
  return [...chats].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
    const atA = a.last_message_at ?? 0;
    const atB = b.last_message_at ?? 0;
    return atB - atA;
  });
}

function sortChatsForList(chats: Chat[]) {
  return sortChatsByPinnedAndTime(
    chats.filter((chat) =>
      chat.chat_type === 'private' ||
      chat.chat_type === 'group' ||
      chat.chat_type === 'channel'
    )
  );
}

function matchesChatQuery(chat: Chat, normalizedQuery: string) {
  const haystack = [
    getChatListTitle(chat),
    chat.last_message_preview,
    chat.description,
    chat.chat_type === 'channel' ? 'канал channel' : null,
    chat.chat_type === 'group' ? 'группа group' : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function ContactResultRow({
  user,
  disabled,
  onPress,
  listStyles,
  accent,
}: {
  user: ApiUser;
  disabled: boolean;
  onPress: (user: ApiUser) => void;
  listStyles: ChatListStyleSet;
  accent: string;
}) {
  const avatarUrl = resolveAvatarUrl(user.avatar_url);
  const displayName = user.display_name || user.username || 'Unknown';
  const handle = user.handle ? `@${user.handle}` : '';

  return (
    <Pressable
      style={({ pressed }) => [listStyles.contactRow, pressed && listStyles.rowPressed]}
      onPress={() => onPress(user)}
      disabled={disabled}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={listStyles.contactAvatar} />
      ) : (
        <View style={listStyles.contactAvatarPlaceholder}>
          <Text style={listStyles.contactAvatarText}>
            {((String(displayName || "?").trim() || "?")[0] || "?").toUpperCase()}
          </Text>
        </View>
      )}
      <View style={listStyles.contactInfo}>
        <Text style={listStyles.contactTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={listStyles.contactSubtitle} numberOfLines={1}>
          {handle || 'Контакт'}
        </Text>
      </View>
      {disabled ? (
        <ActivityIndicator size="small" color={accent} style={listStyles.rowLoader} />
      ) : null}
    </Pressable>
  );
}

export function ChatListScreen() {
  const { colors: themeColors } = useTheme();
  const listStyles = React.useMemo(() => createChatListStyles(themeColors), [themeColors]);
  const navigation = useNavigation<Nav>();
  const chats = chatStore((s) => s.chats);
  const telegramDialogs = telegramAccountStore((s) => s.dialogs);
  const telegramReady = telegramAccountStore((s) => s.authStatus === 'ready');
  const chatListFilter = uiStore((s) => s.chatListFilter);
  const refreshTelegramDialogs = useTelegramDialogsRefresh(telegramReady);
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [menuState, setMenuState] = React.useState<ChatListMenuState>(null);
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const [userResults, setUserResults] = React.useState<ApiUser[]>([]);
  const [channelResults, setChannelResults] = React.useState<Chat[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [creatingChatUserIds, setCreatingChatUserIds] = React.useState<Set<string>>(new Set());
  const searchIdRef = React.useRef(0);

  const sortedChats = React.useMemo(() => sortChatsForList(chats), [chats]);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const isSearchActive = normalizedQuery.length > 0;

  const [hasAttemptedInitialLoad, setHasAttemptedInitialLoad] = React.useState(
    () => chats.length > 0,
  );

  React.useEffect(() => {
    if (chats.length > 0) {
      setHasAttemptedInitialLoad(true);
      return;
    }
    const timeout = setTimeout(() => setHasAttemptedInitialLoad(true), 1500);
    return () => clearTimeout(timeout);
  }, [chats.length]);

  const showInitialSkeleton =
    !hasAttemptedInitialLoad && sortedChats.length === 0 && !isSearchActive;

  React.useEffect(() => {
    const rawQuery = deferredQuery.trim();
    if (!rawQuery) {
      searchIdRef.current += 1;
      setUserResults([]);
      setChannelResults([]);
      setIsSearching(false);
      return;
    }

    const searchId = ++searchIdRef.current;
    const timer = setTimeout(() => {
      setIsSearching(true);
      void Promise.all([searchUsers(rawQuery), searchChannels(rawQuery)])
        .then(([users, channels]) => {
          if (searchId !== searchIdRef.current) return;
          setUserResults(users);
          setChannelResults(channels.filter((channel) => channel.chat_type === 'channel'));
        })
        .catch(() => {
          if (searchId !== searchIdRef.current) return;
          setUserResults([]);
          setChannelResults([]);
        })
        .finally(() => {
          if (searchId === searchIdRef.current) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [deferredQuery]);

  const listItems = React.useMemo<ChatListItem[]>(() => {
    if (!isSearchActive) {
      const filteredChats = chatListFilter === 'telegram_only' ? [] : sortedChats;
      const filteredDialogs = chatListFilter === 'chatus_only' ? [] : telegramDialogs;
      const filteredTelegramReady = chatListFilter === 'chatus_only' ? false : telegramReady;
      return mergeUnifiedChatList(filteredChats, filteredDialogs, filteredTelegramReady);
    }

    const localChats = chatListFilter === 'telegram_only' ? [] : sortedChats.filter((chat) => matchesChatQuery(chat, normalizedQuery));
    const telegramMatches = chatListFilter === 'chatus_only' ? [] : (telegramReady
      ? telegramDialogs.filter((row) => matchesDialogQuery(row, normalizedQuery))
      : []);
    const existingChatIds = new Set(sortedChats.map((chat) => chat.id));
    const remoteChannels = chatListFilter === 'telegram_only' ? [] : channelResults.filter((channel) => !existingChatIds.has(channel.id));
    const users = chatListFilter === 'telegram_only' ? [] : (currentUserId
      ? userResults.filter((user) => user.id !== currentUserId)
      : userResults);

    const items: ChatListItem[] = [];
    if (localChats.length > 0) {
      items.push({ type: 'header', id: 'header:chats', title: 'Чаты' });
      localChats.forEach((chat) => items.push({ type: 'chat', id: `chat:${chat.id}`, chat }));
    }
    if (telegramMatches.length > 0) {
      items.push({ type: 'header', id: 'header:telegram', title: 'Telegram' });
      telegramMatches.forEach((row) =>
        items.push({ type: 'telegram', id: `telegram:${row.id}`, row }),
      );
    }
    if (users.length > 0) {
      items.push({ type: 'header', id: 'header:contacts', title: 'Контакты' });
      users.forEach((user) => items.push({ type: 'contact', id: `contact:${user.id}`, user }));
    }
    if (remoteChannels.length > 0) {
      items.push({ type: 'header', id: 'header:channels', title: 'Каналы' });
      remoteChannels.forEach((channel) =>
        items.push({ type: 'channel', id: `channel:${channel.id}`, channel })
      );
    }
    return items;
  }, [
    channelResults,
    chatListFilter,
    currentUserId,
    isSearchActive,
    normalizedQuery,
    sortedChats,
    telegramDialogs,
    telegramReady,
  ]);

  const activeMenuListItem = React.useMemo(
    () => {
      if (!menuState) return null;
      return listItems.find((item) => {
        if (item.type === 'chat' && item.chat.id === menuState.chatId) return true;
        if (item.type === 'telegram' && item.row.id === menuState.chatId) return true;
        return false;
      }) ?? null;
    },
    [menuState, listItems]
  );
  
  const onRefresh = React.useCallback(async () => {
    if (!telegramReady) return;
    setRefreshing(true);
    try {
      await refreshTelegramDialogs();
    } finally {
      setRefreshing(false);
    }
  }, [telegramReady]);

  const handleOpenChat = React.useCallback(
    (chat: Chat, chatTitle: string) => {
      if (chat.chat_type === 'channel') {
        channelStore.getState().upsertChannel(chat);
        navigation.navigate(isChannelPreviewRequired(chat, currentUserId) ? 'ChannelPreview' : 'ChannelFeed', {
          channelId: chat.id,
        });
        return;
      }

      navigation.navigate('Chat', {
        chatId: chat.id,
        chatTitle,
      });
    },
    [currentUserId, navigation]
  );

  const handleOpenChannelResult = React.useCallback(
    (channel: Chat) => {
      channelStore.getState().upsertChannel(channel);
      if (!isChannelPreviewRequired(channel, currentUserId)) {
        chatStore.getState().addOrUpdateChat(channel);
      }
      navigation.navigate(isChannelPreviewRequired(channel, currentUserId) ? 'ChannelPreview' : 'ChannelFeed', {
        channelId: channel.id,
      });
    },
    [currentUserId, navigation]
  );

  const handleStartChat = React.useCallback(
    async (user: ApiUser) => {
      if (!user.id.trim()) return;
      setCreatingChatUserIds((prev) => new Set(prev).add(user.id));
      try {
        const chat = await createOrFindChat(user.id);
        chatStore.getState().addOrUpdateChat(chat);
        navigation.navigate('Chat', {
          chatId: chat.id,
          chatTitle: getChatListTitle(chat),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('Не удалось открыть чат', msg);
      } finally {
        setCreatingChatUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    },
    [navigation]
  );

  const closeMenu = React.useCallback(() => {
    setMenuState(null);
  }, []);

  const persistAndSetChats = React.useCallback(async (nextChats: Chat[], persistChat?: Chat) => {
    chatStore.getState().setChats(sortChatsByPinnedAndTime(nextChats));
    if (persistChat) {
      await new ChatDao().update({
        id: persistChat.id,
        is_muted: persistChat.is_muted,
        is_pinned: persistChat.is_pinned,
        updated_at: persistChat.updated_at,
      });
    }
  }, []);

  const handleOpenMenu = React.useCallback((chatId: string, event: GestureResponderEvent) => {
    const { left, top } = computeChatListMenuPosition(
      event.nativeEvent.pageX,
      event.nativeEvent.pageY,
    );
    setMenuState({
      chatId,
      top,
      left,
    });
  }, []);

  const handleToggleMute = React.useCallback(async () => {
    if (!activeMenuListItem) return;
    closeMenu();
    if (activeMenuListItem.type === 'telegram') {
      const row = activeMenuListItem.row;
      // Not implemented here right now for TG, we would need tdlibSetChatMuted
      return;
    }
    if (activeMenuListItem.type === 'chat') {
      const activeMenuChat = activeMenuListItem.chat;
      const nextChat: Chat = {
        ...activeMenuChat,
        is_muted: activeMenuChat.is_muted === 1 ? 0 : 1,
        updated_at: Date.now(),
      };
      const nextChats = chats.map((chat) => (chat.id === nextChat.id ? nextChat : chat));
      await persistAndSetChats(nextChats, nextChat);
    }
  }, [activeMenuListItem, chats, closeMenu, persistAndSetChats]);

  const handleTogglePin = React.useCallback(async () => {
    if (!activeMenuListItem) return;
    closeMenu();
    if (activeMenuListItem.type === 'telegram') {
      const row = activeMenuListItem.row;
      const nextPinned = !row.isPinned;
      try {
        await tdlibToggleChatIsPinned(Number(row.chatId), nextPinned);
        // Refresh dialogs list
        await refreshTelegramDialogs();
      } catch {
        /* failed to toggle pin */
      }
      return;
    }
    if (activeMenuListItem.type === 'chat') {
      const activeMenuChat = activeMenuListItem.chat;
      const nextChat: Chat = {
        ...activeMenuChat,
        is_pinned: activeMenuChat.is_pinned === 1 ? 0 : 1,
        updated_at: Date.now(),
      };
      const nextChats = chats.map((chat) => (chat.id === nextChat.id ? nextChat : chat));
      await persistAndSetChats(nextChats, nextChat);
    }
  }, [activeMenuListItem, chats, closeMenu, persistAndSetChats]);

  const handleDeleteChat = React.useCallback(() => {
    if (!activeMenuListItem) return;
    closeMenu();
    
    if (activeMenuListItem.type === 'telegram') {
      Alert.alert('Удалить чат?', 'Удаление Telegram чатов пока доступно только из профиля чата.', [{ text: 'OK' }]);
      return;
    }
    
    if (activeMenuListItem.type === 'chat') {
      const chatToDelete = activeMenuListItem.chat;
      Alert.alert('Удалить чат?', 'Чат исчезнет только на этом устройстве.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await new ChatDao().delete(chatToDelete.id);
              messageStore.getState().clearMessages(chatToDelete.id);
              chatStore.getState().removeChat(chatToDelete.id);
            })().catch(() => {
              Alert.alert('Не удалось удалить чат', 'Попробуй еще раз чуть позже.');
            });
          },
        },
      ]);
    }
  }, [activeMenuListItem, closeMenu]);

  const handleChatLongPress = React.useCallback((chat: Chat, event: GestureResponderEvent) => {
    handleOpenMenu(chat.id, event);
  }, [handleOpenMenu]);

  const handleTelegramLongPress = React.useCallback((row: import('../stores/telegramAccountStore').TelegramDialogRow, event: any) => {
    handleOpenMenu(row.id, event);
  }, [handleOpenMenu]);

  const noopLongPress = React.useCallback(() => undefined, []);

  const onContactPress = React.useCallback((user: ApiUser) => {
    void handleStartChat(user);
  }, [handleStartChat]);

  const renderItem = React.useCallback(
    ({ item }: { item: ChatListItem }) => {
      if (item.type === 'header') {
        return <Text style={listStyles.sectionHeader}>{item.title}</Text>;
      }

      if (item.type === 'telegram') {
        return (
          <TelegramDialogListRow
            item={item.row}
            navigation={navigation}
            onLongPress={handleTelegramLongPress}
          />
        );
      }

      if (item.type === 'contact') {
        return (
          <ContactResultRow
            user={item.user}
            disabled={creatingChatUserIds.has(item.user.id)}
            onPress={onContactPress}
            listStyles={listStyles}
            accent={themeColors.accent}
          />
        );
      }

      const chat = item.type === 'channel' ? item.channel : item.chat;
      return (
        <ChatListRow
          chat={chat}
          currentUserId={currentUserId}
          onPress={handleOpenChat}
          onLongPress={item.type === 'chat' ? handleChatLongPress : noopLongPress}
        />
      );
    },
    [
      creatingChatUserIds,
      currentUserId,
      handleOpenChat,
      handleChatLongPress,
      handleTelegramLongPress,
      noopLongPress,
      onContactPress,
      listStyles,
      navigation,
      themeColors.accent,
    ]
  );

  const keyExtractor = React.useCallback((item: ChatListItem) => item.id, []);

  return (
    <View style={listStyles.container}>
      <FlatList
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <ChatSeparator listStyles={listStyles} />}
        removeClippedSubviews={Platform.OS === 'android' ? true : !isSearchActive}
        initialNumToRender={12}
        maxToRenderPerBatch={Platform.OS === 'android' ? 5 : 8}
        updateCellsBatchingPeriod={Platform.OS === 'android' ? 60 : 45}
        windowSize={Platform.OS === 'android' ? 5 : 8}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          telegramReady ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={themeColors.accent}
            />
          ) : undefined
        }
        ListHeaderComponent={
          <ChatListSearchBar
            listStyles={listStyles}
            iconColor={themeColors.textSecondary}
            placeholderColor={themeColors.placeholder}
            accentColor={themeColors.accent}
            placeholder="Поиск чатов, контактов и каналов"
            value={query}
            onChangeText={setQuery}
            isSearching={isSearching}
          />
        }
        ListEmptyComponent={
          showInitialSkeleton ? (
            <ChatListSkeleton count={8} />
          ) : (
            <View style={listStyles.empty}>
              <Text style={listStyles.emptyText}>
                {isSearchActive ? 'Ничего не найдено' : 'Нет чатов'}
              </Text>
            </View>
          )
        }
      />
      <TelegramDialogsLoadingBanner />
      <ChatListActionsMenu
        visible={menuState != null}
        menuState={menuState}
        isMuted={
          activeMenuListItem?.type === 'chat'
            ? activeMenuListItem.chat.is_muted === 1
            : false
        }
        isPinned={
          activeMenuListItem?.type === 'telegram'
            ? activeMenuListItem.row.isPinned ?? false
            : activeMenuListItem?.type === 'chat'
            ? activeMenuListItem.chat.is_pinned === 1
            : false
        }
        onClose={closeMenu}
        onToggleMute={() => {
          void handleToggleMute();
        }}
        onTogglePin={() => {
          void handleTogglePin();
        }}
        onDelete={handleDeleteChat}
      />
    </View>
  );
}

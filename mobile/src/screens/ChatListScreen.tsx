import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatListActionsMenu, ChatListRow, type ChatListMenuState } from '../components';
import { resolveAvatarUrl } from '../config';
import { ChatDao } from '../db/dao/ChatDao';
import type { ChatsStackParamList } from '../navigation/types';
import { computeChatListMenuPosition, CHAT_LIST_SEPARATOR_INSET } from '../presentation';
import type { ApiUser } from '../services/AuthService';
import { createOrFindChat } from '../services/chatService';
import { searchChannels } from '../services/channelService';
import { searchUsers } from '../services/profileService';
import { authStore } from '../stores/authStore';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import type { Chat } from '../stores/types';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatList'>;

const SEARCH_DEBOUNCE_MS = 300;

type ChatListItem =
  | { type: 'chat'; id: string; chat: Chat }
  | { type: 'contact'; id: string; user: ApiUser }
  | { type: 'channel'; id: string; channel: Chat }
  | { type: 'header'; id: string; title: string };

function ChatSeparator() {
  return <View style={styles.separator} />;
}

function getChatTitle(chat: Chat) {
  return chat.peer_display_name || chat.name || (chat.chat_type === 'channel' ? 'Канал' : 'Chat');
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
    getChatTitle(chat),
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

function SearchHeader() {
  const searchG = TELEGRAM_PROFILE_GLYPHS.search;
  return (
    <View style={styles.searchIconSlot} accessibilityLabel="Search">
      <TelegramGlyph
        d={searchG.d}
        fillRule={searchG.fillRule}
        color={colors.textSecondary}
        size={22}
      />
    </View>
  );
}

function ContactResultRow({
  user,
  disabled,
  onPress,
}: {
  user: ApiUser;
  disabled: boolean;
  onPress: (user: ApiUser) => void;
}) {
  const avatarUrl = resolveAvatarUrl(user.avatar_url);
  const displayName = user.display_name || user.username || 'Unknown';
  const handle = user.handle ? `@${user.handle}` : '';

  return (
    <Pressable
      style={({ pressed }) => [styles.contactRow, pressed && styles.rowPressed]}
      onPress={() => onPress(user)}
      disabled={disabled}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.contactAvatar} />
      ) : (
        <View style={styles.contactAvatarPlaceholder}>
          <Text style={styles.contactAvatarText}>
            {(displayName.trim()[0] || '?').toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.contactInfo}>
        <Text style={styles.contactTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.contactSubtitle} numberOfLines={1}>
          {handle || 'Контакт'}
        </Text>
      </View>
      {disabled ? (
        <ActivityIndicator size="small" color={colors.accent} style={styles.rowLoader} />
      ) : null}
    </Pressable>
  );
}

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const chats = chatStore((s) => s.chats);
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const [menuState, setMenuState] = React.useState<ChatListMenuState>(null);
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const [userResults, setUserResults] = React.useState<ApiUser[]>([]);
  const [channelResults, setChannelResults] = React.useState<Chat[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [creatingChatUserIds, setCreatingChatUserIds] = React.useState<Set<string>>(new Set());
  const searchIdRef = React.useRef(0);

  const sortedChats = React.useMemo(() => sortChatsForList(chats), [chats]);
  const activeMenuChat = React.useMemo(
    () => (menuState ? sortedChats.find((chat) => chat.id === menuState.chatId) ?? null : null),
    [menuState, sortedChats]
  );
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const isSearchActive = normalizedQuery.length > 0;

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
      return sortedChats.map((chat) => ({ type: 'chat', id: `chat:${chat.id}`, chat }));
    }

    const localChats = sortedChats.filter((chat) => matchesChatQuery(chat, normalizedQuery));
    const existingChatIds = new Set(sortedChats.map((chat) => chat.id));
    const remoteChannels = channelResults.filter((channel) => !existingChatIds.has(channel.id));
    const users = currentUserId
      ? userResults.filter((user) => user.id !== currentUserId)
      : userResults;

    return [
      ...localChats.map((chat) => ({ type: 'chat', id: `chat:${chat.id}`, chat }) as ChatListItem),
      ...users.map((user) => ({ type: 'contact', id: `contact:${user.id}`, user }) as ChatListItem),
      ...remoteChannels.map(
        (channel) => ({ type: 'channel', id: `channel:${channel.id}`, channel }) as ChatListItem
      ),
    ];

    const items: ChatListItem[] = [];
    if (localChats.length > 0) {
      items.push({ type: 'header', id: 'header:chats', title: 'Чаты' });
      localChats.forEach((chat) => items.push({ type: 'chat', id: `chat:${chat.id}`, chat }));
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
  }, [channelResults, currentUserId, isSearchActive, normalizedQuery, sortedChats, userResults]);

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
          chatTitle: chat.peer_display_name || chat.name || 'Chat',
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

  const handleOpenMenu = React.useCallback((chat: Chat, event: GestureResponderEvent) => {
    const { left, top } = computeChatListMenuPosition(
      event.nativeEvent.pageX,
      event.nativeEvent.pageY,
    );
    setMenuState({
      chatId: chat.id,
      top,
      left,
    });
  }, []);

  const handleToggleMute = React.useCallback(async () => {
    if (!activeMenuChat) return;
    closeMenu();
    const nextChat: Chat = {
      ...activeMenuChat,
      is_muted: activeMenuChat.is_muted === 1 ? 0 : 1,
      updated_at: Date.now(),
    };
    const nextChats = chats.map((chat) => (chat.id === nextChat.id ? nextChat : chat));
    await persistAndSetChats(nextChats, nextChat);
  }, [activeMenuChat, chats, closeMenu, persistAndSetChats]);

  const handleTogglePin = React.useCallback(async () => {
    if (!activeMenuChat) return;
    closeMenu();
    const nextChat: Chat = {
      ...activeMenuChat,
      is_pinned: activeMenuChat.is_pinned === 1 ? 0 : 1,
      updated_at: Date.now(),
    };
    const nextChats = chats.map((chat) => (chat.id === nextChat.id ? nextChat : chat));
    await persistAndSetChats(nextChats, nextChat);
  }, [activeMenuChat, chats, closeMenu, persistAndSetChats]);

  const handleDeleteChat = React.useCallback(() => {
    if (!activeMenuChat) return;
    const chatToDelete = activeMenuChat;
    closeMenu();

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
  }, [activeMenuChat, closeMenu]);

  const renderItem = React.useCallback(
    ({ item }: { item: ChatListItem }) => {
      if (item.type === 'header') {
        return <Text style={styles.sectionHeader}>{item.title}</Text>;
      }

      if (item.type === 'contact') {
        return (
          <ContactResultRow
            user={item.user}
            disabled={creatingChatUserIds.has(item.user.id)}
            onPress={(user) => {
              void handleStartChat(user);
            }}
          />
        );
      }

      const chat = item.type === 'channel' ? item.channel : item.chat;
      return (
        <ChatListRow
          chat={chat}
          currentUserId={currentUserId}
          onPress={(_, chatTitle) => handleOpenChat(chat, chatTitle)}
          onLongPress={item.type === 'chat' ? handleOpenMenu : () => undefined}
        />
      );
    },
    [creatingChatUserIds, currentUserId, handleOpenChat, handleOpenMenu, handleStartChat]
  );

  const keyExtractor = React.useCallback((item: ChatListItem) => item.id, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={ChatSeparator}
        removeClippedSubviews={!isSearchActive}
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={45}
        windowSize={8}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.searchRow}>
            <SearchHeader />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск чатов, контактов и каналов"
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={colors.accent} style={styles.searchLoader} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {isSearchActive ? 'Ничего не найдено' : 'Нет чатов'}
            </Text>
          </View>
        }
      />
      <ChatListActionsMenu
        visible={menuState != null}
        menuState={menuState}
        chat={activeMenuChat}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.inputBackgroundSolid },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  searchIconSlot: {
    marginRight: 4,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
  },
  searchLoader: {
    marginLeft: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: CHAT_LIST_SEPARATOR_INSET,
    backgroundColor: colors.separator,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    backgroundColor: colors.inputBackgroundSolid,
  },
  contactRow: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackgroundSolid,
  },
  rowPressed: {
    backgroundColor: colors.rowPressed,
  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  contactAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  contactSubtitle: {
    marginTop: 3,
    fontSize: 14,
    color: colors.textSecondary,
  },
  rowLoader: {
    marginLeft: 8,
  },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 16, color: colors.textSecondary },
});

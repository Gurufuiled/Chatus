import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatListActionsMenu, ChatListRow, type ChatListMenuState } from '../components';
import { ChatDao } from '../db/dao/ChatDao';
import type { ChatsStackParamList } from '../navigation/types';
import { computeChatListMenuPosition, CHAT_LIST_SEPARATOR_INSET } from '../presentation';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import type { Chat } from '../stores/types';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatList'>;

function ChatSeparator() {
  return <View style={styles.separator} />;
}

function sortChatsForList(chats: Chat[]) {
  return [...chats].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
    const atA = a.last_message_at ?? 0;
    const atB = b.last_message_at ?? 0;
    return atB - atA;
  });
}

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const chats = chatStore((s) => s.chats);
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const [menuState, setMenuState] = React.useState<ChatListMenuState>(null);

  const sortedChats = React.useMemo(() => sortChatsForList(chats), [chats]);
  const activeMenuChat = React.useMemo(
    () => (menuState ? sortedChats.find((chat) => chat.id === menuState.chatId) ?? null : null),
    [menuState, sortedChats]
  );

  const handleOpenChat = React.useCallback(
    (chatId: string, chatTitle: string) => {
      navigation.navigate('Chat', {
        chatId,
        chatTitle,
      });
    },
    [navigation]
  );

  const closeMenu = React.useCallback(() => {
    setMenuState(null);
  }, []);

  const persistAndSetChats = React.useCallback(async (nextChats: Chat[], persistChat?: Chat) => {
    chatStore.getState().setChats(sortChatsForList(nextChats));
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

  const renderChatRow = React.useCallback(
    ({ item }: { item: Chat }) => (
      <ChatListRow
        chat={item}
        currentUserId={currentUserId}
        onPress={handleOpenChat}
        onLongPress={handleOpenMenu}
      />
    ),
    [currentUserId, handleOpenChat, handleOpenMenu]
  );

  const keyExtractor = React.useCallback((item: Chat) => item.id, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedChats}
        keyExtractor={keyExtractor}
        renderItem={renderChatRow}
        ItemSeparatorComponent={ChatSeparator}
        removeClippedSubviews
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={45}
        windowSize={8}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Нет чатов</Text>
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: CHAT_LIST_SEPARATOR_INSET,
    backgroundColor: colors.separator,
  },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 16, color: colors.textSecondary },
});

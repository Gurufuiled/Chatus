import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatListRow } from '../components/ChatListRow';
import type { ChatsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import type { Chat } from '../stores/types';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatList'>;

function ChatSeparator() {
  return <View style={styles.separator} />;
}

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const chats = chatStore((s) => s.chats);
  const currentUserId = authStore((s) => s.user?.id ?? null);

  const handleOpenChat = React.useCallback(
    (chatId: string, chatTitle: string) => {
      navigation.navigate('Chat', {
        chatId,
        chatTitle,
      });
    },
    [navigation]
  );

  const renderChatRow = React.useCallback(
    ({ item }: { item: Chat }) => (
      <ChatListRow chat={item} currentUserId={currentUserId} onPress={handleOpenChat} />
    ),
    [currentUserId, handleOpenChat]
  );

  const keyExtractor = React.useCallback((item: Chat) => item.id, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
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
            <Text style={styles.emptyText}>No chats yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  separator: {
    height: 1,
    marginLeft: 74,
    backgroundColor: '#DADFE7',
  },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Chat } from '../stores/types';

type ChatForwardSheetProps = {
  visible: boolean;
  chats: Chat[];
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
};

export function ChatForwardSheet({
  visible,
  chats,
  onClose,
  onSelectChat,
}: ChatForwardSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.forwardRoot}>
        <Pressable style={styles.forwardBackdrop} onPress={onClose} />
        <View style={styles.forwardSheet}>
          <Text style={styles.forwardTitle}>Переслать в...</Text>
          <ScrollView style={styles.forwardList} showsVerticalScrollIndicator={false}>
            {chats.map((chat) => (
              <Pressable
                key={chat.id}
                onPress={() => onSelectChat(chat.id)}
                style={styles.forwardRow}
              >
                <View style={styles.forwardAvatar}>
                  <Text style={styles.forwardAvatarText}>
                    {(chat.peer_display_name || chat.name || 'Ч')[0]?.toUpperCase() ?? 'Ч'}
                  </Text>
                </View>
                <View style={styles.forwardRowText}>
                  <Text style={styles.forwardChatName}>
                    {chat.peer_display_name || chat.name || 'Чат'}
                  </Text>
                  <Text numberOfLines={1} style={styles.forwardChatMeta}>
                    {chat.last_message_preview || 'Нажмите, чтобы переслать сюда'}
                  </Text>
                </View>
              </Pressable>
            ))}
            {chats.length === 0 ? (
              <View style={styles.forwardEmpty}>
                <Text style={styles.forwardEmptyText}>Пока нет других чатов для пересылки.</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  forwardRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  forwardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 17, 29, 0.18)',
  },
  forwardSheet: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 22,
    maxHeight: '65%',
  },
  forwardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: '#17202A',
    marginBottom: 12,
  },
  forwardList: {
    maxHeight: 360,
  },
  forwardEmpty: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  forwardEmptyText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#6B7280',
    textAlign: 'center',
  },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  forwardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#D9E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  forwardAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#487FE8',
  },
  forwardRowText: {
    flex: 1,
    minWidth: 0,
  },
  forwardChatName: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    color: '#17202A',
  },
  forwardChatMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
  },
});

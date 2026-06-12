import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { resolveAvatarUrl } from '../config';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChatsStackParamList>;

type Props = {
  visible: boolean;
  linkText: string;
  onClose: () => void;
};

export function ShareLinkToChatSheet({ visible, linkText, onClose }: Props) {
  const navigation = useNavigation<Nav>();
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const chats = chatStore((s) => s.chats);

  const rows = React.useMemo(() => {
    return chats.filter((c) => {
      if (c.chat_type === 'private') return true;
      if (c.chat_type === 'group') return true;
      return false;
    });
  }, [chats]);

  const handlePickChat = React.useCallback(
    (chatId: string, title: string) => {
      void Clipboard.setStringAsync(linkText);
      onClose();
      navigation.navigate('Chat', { chatId, chatTitle: title });
    },
    [linkText, navigation, onClose],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Отправить в чат</Text>
          <Text style={styles.sheetHint}>Ссылка скопирована — вставьте её в поле ввода</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color="#6B7280" />
          </Pressable>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const title =
              item.name?.trim() ||
              item.peer_display_name?.trim() ||
              (item.chat_type === 'private'
                ? item.members?.find((m) => m.user_id !== currentUserId)?.user?.display_name ??
                  'Чат'
                : 'Чат');
            const avatar = resolveAvatarUrl(item.avatar_url ?? null);
            const initial = (title[0] || '?').toUpperCase();
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => handlePickChat(item.id, title)}
              >
                {avatar ? (
                  <Image
                    source={{ uri: avatar }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarLetter}>{initial}</Text>
                  </View>
                )}
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.textSecondary} />
              </Pressable>
            );
          }}
        />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    width: '100%',
    maxHeight: '72%',
    backgroundColor: '#F0F0F5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3E4E8',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  sheetHint: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
  },
  rowPressed: { opacity: 0.85 },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#93C5FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  rowTitle: { flex: 1, fontSize: 17, color: '#111827' },
});

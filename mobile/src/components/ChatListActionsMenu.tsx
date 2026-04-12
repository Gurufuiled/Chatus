import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Chat } from '../stores/types';
import { CHAT_LIST_MENU_WIDTH } from '../presentation';
import { colors } from '../theme/colors';

export type ChatListMenuState = {
  chatId: string;
  top: number;
  left: number;
} | null;

type ChatListActionsMenuProps = {
  visible: boolean;
  menuState: ChatListMenuState;
  chat: Chat | null;
  onClose: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
};

function MenuAction({
  label,
  icon,
  danger = false,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.actionRowPressed,
      ]}
    >
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Feather
          name={icon}
          size={17}
          color={danger ? '#E53935' : colors.textPrimary}
        />
      </View>
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const ChatListActionsMenu = React.memo(function ChatListActionsMenu({
  visible,
  menuState,
  chat,
  onClose,
  onToggleMute,
  onTogglePin,
  onDelete,
}: ChatListActionsMenuProps) {
  if (!visible || !menuState || !chat) return null;

  const muteLabel = chat.is_muted === 1 ? 'Включить уведомления' : 'Отключить уведомления';
  const pinLabel = chat.is_pinned === 1 ? 'Открепить' : 'Закрепить';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.menuCard,
            {
              top: menuState.top,
              left: menuState.left,
            },
          ]}
        >
          <MenuAction label={pinLabel} icon="bookmark" onPress={onTogglePin} />
          <MenuAction
            label={muteLabel}
            icon={chat.is_muted === 1 ? 'bell' : 'bell-off'}
            onPress={onToggleMute}
          />
          <MenuAction label="Удалить чат" icon="trash-2" danger onPress={onDelete} />
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  menuCard: {
    position: 'absolute',
    width: CHAT_LIST_MENU_WIDTH,
    borderRadius: 12,
    backgroundColor: colors.inputBackgroundSolid,
    paddingVertical: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  actionRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRowPressed: {
    backgroundColor: colors.rowPressed,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
    marginRight: 12,
  },
  iconWrapDanger: {
    backgroundColor: '#FEECEC',
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionLabelDanger: {
    color: '#E53935',
  },
});

import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import type { Chat } from '../stores/types';
import { useTheme } from '../contexts/ThemeContext';
import {
  createChatListActionsMenuStyles,
  type ChatListActionsMenuStyleSet,
} from './chatListActionsMenu.styles';

export type ChatListMenuState = {
  chatId: string;
  top: number;
  left: number;
} | null;

type ChatListActionsMenuProps = {
  visible: boolean;
  menuState: ChatListMenuState;
  isMuted: boolean;
  isPinned: boolean;
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
  styles,
  textPrimary,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  danger?: boolean;
  onPress: () => void;
  styles: ChatListActionsMenuStyleSet;
  textPrimary: string;
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
          color={danger ? '#E53935' : textPrimary}
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
  isMuted,
  isPinned,
  onClose,
  onToggleMute,
  onTogglePin,
  onDelete,
}: ChatListActionsMenuProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatListActionsMenuStyles(themeColors),
    [themeColors],
  );

  if (!visible || !menuState) return null;

  const muteLabel = isMuted ? 'Включить уведомления' : 'Отключить уведомления';
  const pinLabel = isPinned ? 'Открепить' : 'Закрепить';

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
          <MenuAction
            label={pinLabel}
            icon="bookmark"
            onPress={onTogglePin}
            styles={styles}
            textPrimary={themeColors.textPrimary}
          />
          <MenuAction
            label={muteLabel}
            icon={chat.is_muted === 1 ? 'bell' : 'bell-off'}
            onPress={onToggleMute}
            styles={styles}
            textPrimary={themeColors.textPrimary}
          />
          <MenuAction
            label="Удалить чат"
            icon="trash-2"
            danger
            onPress={onDelete}
            styles={styles}
            textPrimary={themeColors.textPrimary}
          />
        </View>
      </View>
    </Modal>
  );
});

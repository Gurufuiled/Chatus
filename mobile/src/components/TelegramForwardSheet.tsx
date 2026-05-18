import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import type { TelegramDialogRow } from '../stores/telegramAccountStore';

type TelegramForwardSheetProps = {
  visible: boolean;
  dialogs: TelegramDialogRow[];
  excludeChatId?: number;
  pending?: boolean;
  onClose: () => void;
  onSelectChat: (telegramChatId: string) => void;
};

function sortDialogsForForward(rows: TelegramDialogRow[]) {
  return [...rows].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
}

export function TelegramForwardSheet({
  visible,
  dialogs,
  excludeChatId,
  pending = false,
  onClose,
  onSelectChat,
}: TelegramForwardSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const targets = useMemo(() => {
    if (!visible) return [];
    const exclude = excludeChatId != null ? String(excludeChatId) : null;
    return sortDialogsForForward(
      dialogs.filter((row) => row.chatId !== exclude),
    );
  }, [dialogs, excludeChatId, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Переслать в...</Text>
            {pending ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!pending}
          >
            {targets.map((dialog) => {
              const initial = (dialog.title.trim()[0] || '?').toUpperCase();
              const meta =
                dialog.lastMessagePreview?.trim() ||
                (dialog.chatType === 'channel' && dialog.memberCount != null
                  ? `${dialog.memberCount.toLocaleString()} подписчиков`
                  : 'Нажмите, чтобы переслать сюда');
              return (
                <Pressable
                  key={dialog.id}
                  disabled={pending}
                  onPress={() => onSelectChat(dialog.chatId)}
                  style={({ pressed }) => [styles.row, pressed && !pending && styles.rowPressed, pending && styles.rowDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Переслать в ${dialog.title}`}
                >
                  {dialog.avatarUri ? (
                    <Image source={{ uri: dialog.avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {dialog.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.chatMeta}>
                      {meta}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {targets.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  Нет других чатов. Откройте список Telegram-чатов и потяните вниз для обновления.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(12, 17, 29, 0.35)',
    },
    sheet: {
      backgroundColor: colors.inputBackgroundSolid,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 14,
      paddingHorizontal: 14,
      paddingBottom: 22,
      maxHeight: '65%',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 12,
    },
    title: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      flex: 1,
    },
    list: {
      maxHeight: 360,
    },
    empty: {
      paddingVertical: 18,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    rowPressed: {
      opacity: 0.72,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    avatarImage: {
      width: 42,
      height: 42,
      borderRadius: 21,
      marginRight: 12,
    },
    avatarPlaceholder: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    chatName: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    chatMeta: {
      marginTop: 2,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
  });
}

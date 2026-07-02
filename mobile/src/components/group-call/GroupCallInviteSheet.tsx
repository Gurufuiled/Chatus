import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGroupCall } from '../../contexts/GroupCallContext';
import { useTheme } from '../../contexts/ThemeContext';
import { chatStore } from '../../stores/chatStore';

export function GroupCallInviteSheet() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { inviteSheetVisible, setInviteSheetVisible, state } = useGroupCall();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const chat = state.chatId ? chatStore.getState().chats.find((c) => c.id === state.chatId) : null;
  const members = chat?.members ?? [];
  const inCallIds = new Set(state.participants.map((p) => p.userId));

  if (!inviteSheetVisible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={() => setInviteSheetVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setInviteSheetVisible(false)} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Пригласить в звонок</Text>
        {members.map((member) => {
          const name =
            [member.user?.display_name, member.user?.last_name].filter(Boolean).join(' ').trim() ||
            'Участник';
          const inCall = inCallIds.has(member.user_id);
          return (
            <View key={member.user_id} style={styles.row}>
              <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.rowStatus, { color: colors.textSecondary }]}>
                {inCall ? 'в звонке ✓' : 'в группе'}
              </Text>
            </View>
          );
        })}
        <Pressable
          onPress={() => setInviteSheetVisible(false)}
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          <Text style={styles.doneText}>Готово</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function createStyles(colors: {
  textPrimary: string;
  textSecondary: string;
  inputBackgroundSolid: string;
  accent: string;
}) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      backgroundColor: colors.inputBackgroundSolid,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 20,
      paddingTop: 16,
      maxHeight: '70%',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      gap: 12,
    },
    rowName: {
      flex: 1,
      fontSize: 15,
    },
    rowStatus: {
      fontSize: 13,
    },
    doneButton: {
      marginTop: 12,
      alignSelf: 'flex-end',
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    doneText: {
      color: '#fff',
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.88,
    },
  });
}

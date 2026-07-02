import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

type GroupCallStartSheetProps = {
  visible: boolean;
  onClose: () => void;
  onStartVoice: () => void;
};

export function GroupCallStartSheet({
  visible,
  onClose,
  onStartVoice,
}: GroupCallStartSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Голосовой чат</Text>

        <Pressable
          onPress={() => {
            onClose();
            onStartVoice();
          }}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}
        >
          <Text style={styles.optionEmoji}>🔊</Text>
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
              Начать голосовой чат
            </Text>
            <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
              Участники группы смогут присоединиться
            </Text>
          </View>
        </Pressable>

        <View style={[styles.option, styles.optionDisabled]}>
          <Text style={styles.optionEmoji}>📹</Text>
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, { color: colors.textSecondary }]}>Видеозвонок</Text>
            <Text style={[styles.optionHint, { color: colors.textSecondary }]}>Скоро</Text>
          </View>
        </View>

        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: colors.accent }]}>Отмена</Text>
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
      paddingTop: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textSecondary,
      opacity: 0.35,
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 12,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    optionDisabled: {
      opacity: 0.55,
    },
    optionEmoji: {
      fontSize: 22,
      width: 28,
      textAlign: 'center',
    },
    optionText: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    optionHint: {
      marginTop: 2,
      fontSize: 13,
    },
    cancel: {
      alignSelf: 'flex-end',
      paddingVertical: 14,
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.85,
    },
  });
}

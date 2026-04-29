import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CHAT_THEME_ORDER,
  ChatThemePreview,
  DEFAULT_CHAT_THEME_ID,
  type ChatThemeId,
  getChatTheme,
} from '../theme/chatThemes';
import { useTheme } from '../contexts/ThemeContext';

type ChatThemePickerModalProps = {
  visible: boolean;
  selectedThemeId: ChatThemeId;
  onSelectTheme: (themeId: ChatThemeId) => void;
  onApply: () => void;
  onClose: () => void;
};

export function ChatThemePickerModal({
  visible,
  selectedThemeId,
  onSelectTheme,
  onApply,
  onClose,
}: ChatThemePickerModalProps) {
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.headerRow}>
            <Pressable hitSlop={10} onPress={onClose} style={styles.headerAction}>
              <Text style={styles.headerActionText}>Назад</Text>
            </Pressable>
            <Text style={styles.title}>Выбрать тему</Text>
            <View style={styles.headerActionPlaceholder} />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewRow}
          >
            {CHAT_THEME_ORDER.map((themeId) => (
              <Pressable
                key={themeId}
                onPress={() => onSelectTheme(themeId)}
                style={styles.previewPressable}
              >
                <ChatThemePreview themeId={themeId} selected={selectedThemeId === themeId} />
                <Text
                  style={[
                    styles.previewLabel,
                    selectedThemeId === themeId && styles.previewLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {themeId === DEFAULT_CHAT_THEME_ID ? 'Без темы' : getChatTheme(themeId, resolvedScheme).name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>



          <Pressable
            onPress={onApply}
            style={({ pressed }) => [styles.applyButton, pressed && styles.applyButtonPressed]}
          >
            <Text style={styles.applyButtonText}>Применить тему</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 18, 32, 0.24)',
    zIndex: 0,
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingTop: 14,
    paddingHorizontal: 16,
    zIndex: 2,
    elevation: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerAction: {
    minWidth: 52,
  },
  headerActionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2A8B53',
  },
  headerActionPlaceholder: {
    minWidth: 52,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  previewRow: {
    gap: 14,
    paddingRight: 10,
  },
  previewPressable: {
    width: 86,
    alignItems: 'center',
  },
  previewLabel: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  previewLabelActive: {
    color: '#1D6E3B',
  },
  captionWrap: {
    marginTop: 16,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  captionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  captionText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
  },
  applyButton: {
    minHeight: 52,
    borderRadius: 22,
    backgroundColor: '#2AA04F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonPressed: {
    opacity: 0.9,
  },
  applyButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

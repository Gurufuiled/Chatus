import React, { useEffect, useState } from 'react';
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
  selectedWallpaperId: ChatThemeId;
  onSelectTheme: (themeId: ChatThemeId) => void;
  onSelectWallpaper: (wallpaperId: ChatThemeId) => void;
  onApply: () => void;
  onClose: () => void;
};

export function ChatThemePickerModal({
  visible,
  selectedThemeId,
  selectedWallpaperId,
  onSelectTheme,
  onSelectWallpaper,
  onApply,
  onClose,
}: ChatThemePickerModalProps) {
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const [section, setSection] = useState<'wallpaper' | 'colors'>('wallpaper');

  useEffect(() => {
    if (visible) setSection('wallpaper');
  }, [visible]);

  const isWallpaper = section === 'wallpaper';
  const selectedId = isWallpaper ? selectedWallpaperId : selectedThemeId;
  const resetDraft = () => {
    onSelectTheme(DEFAULT_CHAT_THEME_ID);
    onSelectWallpaper(DEFAULT_CHAT_THEME_ID);
  };

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

          <Text pointerEvents="none" style={styles.titleOverlay}>Оформление чата</Text>
          <Pressable onPress={resetDraft} style={styles.resetAction} hitSlop={10}>
            <Text style={styles.resetActionText}>Сбросить</Text>
          </Pressable>

          <View style={styles.livePreview}>
            <ChatThemePreview
              themeId={selectedThemeId}
              wallpaperId={selectedWallpaperId}
              selected={false}
            />
            <View style={styles.previewCopy}>
              <Text style={styles.previewTitle}>Предпросмотр</Text>
              <Text style={styles.previewSubtitle}>Изменения появятся после применения</Text>
            </View>
          </View>

          <View style={styles.segmentedControl}>
            {([
              ['wallpaper', 'Обои'],
              ['colors', 'Цвет сообщений'],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setSection(value)}
                style={[styles.segment, section === value && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, section === value && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionHint}>
            {isWallpaper ? 'Обои меняют только фон чата.' : 'Цвет меняет пузыри сообщений и акцент.'}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewRow}
          >
            {CHAT_THEME_ORDER.map((themeId) => (
              <Pressable
                key={themeId}
                onPress={() => (isWallpaper ? onSelectWallpaper(themeId) : onSelectTheme(themeId))}
                style={styles.previewPressable}
              >
                <ChatThemePreview
                  themeId={isWallpaper ? selectedThemeId : themeId}
                  wallpaperId={isWallpaper ? themeId : selectedWallpaperId}
                  selected={selectedId === themeId}
                />
                <Text
                  style={[
                    styles.previewLabel,
                    selectedId === themeId && styles.previewLabelActive,
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
            <Text pointerEvents="none" style={styles.applyButtonOverlay}>Применить оформление</Text>
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
  titleOverlay: {
    position: 'absolute',
    top: 14,
    left: 80,
    right: 80,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  resetAction: {
    position: 'absolute',
    top: 14,
    right: 16,
    minHeight: 32,
    justifyContent: 'center',
  },
  resetActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2A8B53',
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
    opacity: 0,
  },
  livePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  previewCopy: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  previewSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    backgroundColor: '#EEF1F5',
    marginBottom: 9,
  },
  segment: {
    flex: 1,
    minHeight: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A8494',
  },
  segmentTextActive: {
    color: '#1D6E3B',
  },
  sectionHint: {
    marginBottom: 12,
    fontSize: 13,
    color: '#6B7280',
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
    position: 'relative',
  },
  applyButtonPressed: {
    opacity: 0.9,
  },
  applyButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    opacity: 0,
  },
  applyButtonOverlay: {
    position: 'absolute',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});

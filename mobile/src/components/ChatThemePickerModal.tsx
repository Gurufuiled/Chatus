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
  const { colors, resolvedScheme } = useTheme();
  const [section, setSection] = useState<'wallpaper' | 'colors'>('wallpaper');

  useEffect(() => {
    if (visible) setSection('wallpaper');
  }, [visible]);

  const isWallpaper = section === 'wallpaper';
  const selectedId = isWallpaper ? selectedWallpaperId : selectedThemeId;

  const resetDraft = () => {
    onSelectWallpaper(DEFAULT_CHAT_THEME_ID);
    onSelectTheme(DEFAULT_CHAT_THEME_ID);
  };

  const selectWallpaper = (wallpaperId: ChatThemeId) => {
    // A wallpaper starts with its designed bubble palette. The user can then
    // override only the bubble color in the second section.
    onSelectWallpaper(wallpaperId);
    onSelectTheme(wallpaperId);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 18),
              backgroundColor: colors.toolbar,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Pressable hitSlop={10} onPress={onClose} style={styles.headerAction}>
              <Text style={[styles.headerActionText, { color: colors.accent }]}>Назад</Text>
            </Pressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Оформление чата</Text>
            <Pressable onPress={resetDraft} hitSlop={10} style={styles.resetAction}>
              <Text style={[styles.resetActionText, { color: colors.accent }]}>Сбросить</Text>
            </Pressable>
          </View>

          <View style={styles.livePreview}>
            <ChatThemePreview
              themeId={selectedThemeId}
              wallpaperId={selectedWallpaperId}
              selected={false}
            />
            <View style={styles.previewCopy}>
              <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
                Предпросмотр
              </Text>
              <Text style={[styles.previewSubtitle, { color: colors.textSecondary }]}>
                Фон и цвет сообщений можно настроить отдельно
              </Text>
            </View>
          </View>

          <View style={[styles.segmentedControl, { backgroundColor: colors.inputBackground }]}>
            {([
              ['wallpaper', 'Обои'],
              ['colors', 'Цвет сообщений'],
            ] as const).map(([value, label]) => {
              const active = section === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSection(value)}
                  style={[
                    styles.segment,
                    active && {
                      backgroundColor: colors.inputBackgroundSolid,
                      borderColor: colors.separator,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? colors.accent : colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
            {isWallpaper
              ? 'При выборе обоев сразу устанавливается подходящий цвет сообщений.'
              : 'Здесь можно оставить фон и изменить только цвет своих сообщений.'}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewRow}
          >
            {CHAT_THEME_ORDER.map((themeId) => (
              <Pressable
                key={themeId}
                onPress={() =>
                  isWallpaper ? selectWallpaper(themeId) : onSelectTheme(themeId)
                }
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
                    {
                      color:
                        selectedId === themeId ? colors.accent : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {themeId === DEFAULT_CHAT_THEME_ID
                    ? isWallpaper
                      ? 'Без обоев'
                      : 'По умолчанию'
                    : getChatTheme(themeId, resolvedScheme).name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={onApply}
            style={({ pressed }) => [
              styles.applyButton,
              { backgroundColor: colors.accent },
              pressed && styles.applyButtonPressed,
            ]}
          >
            <Text style={styles.applyButtonText}>Применить оформление</Text>
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
    backgroundColor: 'rgba(5, 10, 20, 0.36)',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 14,
    paddingHorizontal: 16,
    elevation: 14,
  },
  headerRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerAction: {
    width: 68,
    justifyContent: 'center',
  },
  headerActionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  resetAction: {
    width: 68,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  resetActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  livePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  previewCopy: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  previewSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    marginBottom: 9,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHint: {
    minHeight: 34,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
  },
  previewRow: {
    gap: 14,
    paddingRight: 10,
    paddingBottom: 4,
  },
  previewPressable: {
    width: 86,
    alignItems: 'center',
  },
  previewLabel: {
    minHeight: 32,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  applyButton: {
    minHeight: 52,
    marginTop: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonPressed: {
    opacity: 0.88,
  },
  applyButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

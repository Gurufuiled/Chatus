import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAIN_TAB_BAR_HEIGHT } from '../navigation/mainTabMetrics';
import { useTheme } from '../contexts/ThemeContext';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { withAlpha } from '../theme/stylePrimitives';

const BANNER_GAP_ABOVE_TAB = 10;

export function TelegramDialogsLoadingBanner() {
  const { colors, resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const telegramReady = telegramAccountStore((s) => s.authStatus === 'ready');
  const dialogsSyncing = telegramAccountStore((s) => s.dialogsSyncing);

  if (!telegramReady || !dialogsSyncing) {
    return null;
  }

  const bottom =
    MAIN_TAB_BAR_HEIGHT + Math.max(insets.bottom, Platform.OS === 'ios' ? 4 : 8) + BANNER_GAP_ABOVE_TAB;
  const isLight = resolvedScheme === 'light';

  return (
    <View pointerEvents="none" style={[styles.host, { bottom }]}>
      <BlurView
        intensity={isLight ? 72 : 64}
        tint={isLight ? 'light' : 'dark'}
        blurMethod="dimezisBlurView"
        style={[
          styles.pill,
          {
            backgroundColor: isLight ? 'rgba(255,255,255,0.88)' : withAlpha(colors.toolbar, 0.92),
            borderColor: withAlpha(colors.separator, isLight ? 0.9 : 0.55),
          },
        ]}
      >
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
          Идёт подгрузка чатов Telegram
        </Text>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxWidth: '92%',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});

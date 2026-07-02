import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TelegramGlyph, TELEGRAM_CALL_GLYPHS } from '../../icons/telegram';
import { useGroupCall } from '../../contexts/GroupCallContext';
import { useTheme } from '../../contexts/ThemeContext';
import { withAlpha } from '../../theme/colors';

type GroupCallMinimizedBarProps = {
  bottomOffset: number;
};

function formatDuration(startedAt?: number, now = Date.now()) {
  if (!startedAt) return '0:00';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function GroupCallMinimizedBar({ bottomOffset }: GroupCallMinimizedBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { state, expand, toggleMute, leaveGroupCall } = useGroupCall();
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (state.phase !== 'minimized') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (state.phase !== 'minimized') return null;

  const count = Math.max(state.participants.length, 1);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomOffset + Math.max(insets.bottom, 8) }]}
    >
      <Pressable onPress={expand} style={({ pressed }) => [styles.bar, pressed && styles.pressed]}>
        <Text style={styles.emoji}>🔊</Text>
        <Text style={styles.label} numberOfLines={1}>
          {`Голосовой чат · ${count} · ${formatDuration(state.startedAt, now)}`}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              void toggleMute();
            }}
            hitSlop={8}
            style={styles.iconButton}
          >
            <TelegramGlyph
              d={TELEGRAM_CALL_GLYPHS[state.isMuted ? 'unmute' : 'mute'].d}
              fillRule={TELEGRAM_CALL_GLYPHS[state.isMuted ? 'unmute' : 'mute'].fillRule}
              viewBox={TELEGRAM_CALL_GLYPHS[state.isMuted ? 'unmute' : 'mute'].viewBox}
              size={22}
              color="#fff"
            />
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              void leaveGroupCall();
            }}
            hitSlop={8}
            style={styles.iconButton}
          >
            <TelegramGlyph
              d={TELEGRAM_CALL_GLYPHS.hangup.d}
              fillRule={TELEGRAM_CALL_GLYPHS.hangup.fillRule}
              viewBox={TELEGRAM_CALL_GLYPHS.hangup.viewBox}
              size={22}
              color="#fff"
            />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

function createStyles(colors: { accent: string }) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 30,
      elevation: 12,
    },
    bar: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: withAlpha(colors.accent, 0.92),
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 10,
    },
    emoji: {
      fontSize: 18,
    },
    label: {
      flex: 1,
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha('#000', 0.18),
    },
    pressed: {
      opacity: 0.92,
    },
  });
}

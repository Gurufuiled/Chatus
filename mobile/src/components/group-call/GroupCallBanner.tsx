import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { withAlpha } from '../../theme/colors';
import type { ApiGroupCallRoom } from '../../services/groupCallService';

type GroupCallBannerProps = {
  chatId: string;
  activeRoom: ApiGroupCallRoom | null | undefined;
  isUserInCall: boolean;
  participantPreview?: string;
  onJoin: () => void;
  onOpen: () => void;
};

export function GroupCallBanner({
  activeRoom,
  isUserInCall,
  participantPreview,
  onJoin,
  onOpen,
}: GroupCallBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!activeRoom) return null;

  const count = activeRoom.participant_count || 0;
  const subtitle =
    participantPreview?.trim() ||
    (count > 0 ? `${count} участник${count === 1 ? '' : count < 5 ? 'а' : 'ов'}` : '');

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🔊</Text>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {`Голосовой чат · ${count || '…'} участник${count === 1 ? '' : count < 5 ? 'а' : 'ов'}`}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={isUserInCall ? onOpen : onJoin}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{isUserInCall ? 'Открыть' : 'Присоединиться'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: { accent: string; textPrimary: string; textSecondary: string }) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
    },
    card: {
      borderRadius: 14,
      backgroundColor: withAlpha(colors.accent, 0.12),
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    emoji: {
      fontSize: 20,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
    },
    cta: {
      borderRadius: 12,
      backgroundColor: colors.accent,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    ctaPressed: {
      opacity: 0.88,
    },
    ctaText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
  });
}

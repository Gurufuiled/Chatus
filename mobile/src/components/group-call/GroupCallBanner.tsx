import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { ApiGroupCallRoom } from '../../services/groupCallService';

type GroupCallBannerProps = {
  chatId: string;
  activeRoom: ApiGroupCallRoom | null | undefined;
  isUserInCall: boolean;
  participantPreview?: string;
  onJoin: () => void;
  onOpen: () => void;
};

function formatParticipantCount(count: number) {
  if (count === 1) return '1 участник';
  if (count > 1 && count < 5) return `${count} участника`;
  return `${count} участников`;
}

export function GroupCallBanner({
  activeRoom,
  isUserInCall,
  onJoin,
  onOpen,
}: GroupCallBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors.accent), [colors.accent]);

  if (!activeRoom) return null;

  const count = activeRoom.participant_count || 0;
  const countLabel = count > 0 ? formatParticipantCount(count) : '…';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.textRow}>
          <View style={styles.dot} />
          <Text style={styles.title} numberOfLines={1}>
            {`Голосовой чат · ${countLabel}`}
          </Text>
        </View>
        <Pressable
          onPress={isUserInCall ? onOpen : onJoin}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Feather name="phone" size={15} color={colors.accent} />
          <Text style={[styles.ctaText, { color: colors.accent }]}>
            {isUserInCall ? 'Открыть' : 'Присоединиться'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(accent: string) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
    },
    card: {
      borderRadius: 14,
      backgroundColor: accent,
      paddingLeft: 14,
      paddingRight: 8,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
    },
    textRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
    },
    title: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
    cta: {
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    ctaPressed: {
      opacity: 0.88,
    },
    ctaText: {
      fontSize: 14,
      fontWeight: '700',
    },
  });
}

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { ApiGroupCallRoom } from '../../services/groupCallService';
import { formatParticipantCount } from '../../utils/groupCallSystemMessage';

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
  const title =
    count > 0
      ? `Голосовой чат · ${formatParticipantCount(count)}`
      : 'Голосовой чат';
  const subtitle = participantPreview?.trim() || null;

  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <View style={styles.liveDot} />
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={isUserInCall ? onOpen : onJoin}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Feather
            name={isUserInCall ? 'maximize-2' : 'phone'}
            size={14}
            color={colors.accent}
          />
          <Text style={styles.ctaText}>{isUserInCall ? 'Открыть' : 'Присоединиться'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: { accent: string }) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 2,
    },
    banner: {
      borderRadius: 10,
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
      opacity: 0.95,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    subtitle: {
      marginTop: 1,
      fontSize: 12,
      color: 'rgba(255,255,255,0.86)',
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 8,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    ctaPressed: {
      opacity: 0.9,
    },
    ctaText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '700',
    },
  });
}

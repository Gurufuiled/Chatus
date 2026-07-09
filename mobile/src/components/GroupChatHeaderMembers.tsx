import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { resolveAvatarUrl } from '../config';
import type { ChatsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import type { Chat } from '../stores/types';

const GROUP_HEADER_MEMBER_CHIP = 28;
const GROUP_HEADER_MEMBER_OVERLAP = 10;
const GROUP_HEADER_MEMBERS_MAX = 5;

const MEMBER_CHIP_COLORS = ['#5B8DEF', '#53B7A8', '#F2994A', '#BB6BD9', '#EB5757', '#2D9CDB'];

function memberChipColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = seed.charCodeAt(i) + ((h << 5) - h);
  }
  return MEMBER_CHIP_COLORS[Math.abs(h) % MEMBER_CHIP_COLORS.length] ?? MEMBER_CHIP_COLORS[0];
}

function getGroupMemberDisplayName(m: NonNullable<Chat['members']>[number]): string {
  return (
    m.user?.display_name?.trim() ||
    m.user?.username?.trim() ||
    m.user?.handle?.trim() ||
    m.user_id?.trim() ||
    'Участник'
  );
}

type GroupChatHeaderMembersProps = {
  members: NonNullable<Chat['members']>;
  currentUserId: string | null;
  chatId: string;
  navigation: NativeStackNavigationProp<ChatsStackParamList, 'Chat'> | { navigate: (...args: unknown[]) => void };
};

export function GroupChatHeaderMembers({
  members,
  currentUserId,
  chatId,
  navigation,
}: GroupChatHeaderMembersProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const ordered = useMemo(() => {
    const list = members.filter((m) => m.user_id?.trim());
    const others = list.filter((m) => m.user_id !== currentUserId);
    const me = list.find((m) => m.user_id === currentUserId);
    return [...others, ...(me ? [me] : [])];
  }, [members, currentUserId]);

  if (ordered.length === 0) return null;

  const shown = ordered.slice(0, GROUP_HEADER_MEMBERS_MAX);
  const overflow = ordered.length - shown.length;

  return (
    <View style={styles.row} accessibilityRole="toolbar">
      {shown.map((m, index) => {
        const name = getGroupMemberDisplayName(m);
        const uri = resolveAvatarUrl(m.user?.avatar_url ?? null);
        const initial = (name.trim()[0] || '?').toUpperCase();
        return (
          <Pressable
            key={m.user_id}
            accessibilityRole="button"
            accessibilityLabel={`Профиль: ${name}`}
            hitSlop={6}
            onPress={() =>
              (navigation as NativeStackNavigationProp<ChatsStackParamList, 'Chat'>).navigate(
                'ChatProfile',
                {
                  chatId,
                  userId: m.user_id,
                  chatTitle: name,
                },
              )
            }
            style={[
              styles.memberPressable,
              index > 0 && { marginLeft: -GROUP_HEADER_MEMBER_OVERLAP },
              { zIndex: shown.length - index },
            ]}
          >
            {uri ? (
              <Image
                source={{ uri }}
                style={[styles.memberAvatar, { borderColor: colors.toolbar }]}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View
                style={[
                  styles.memberAvatar,
                  styles.memberAvatarPlaceholder,
                  { borderColor: colors.toolbar, backgroundColor: memberChipColor(m.user_id) },
                ]}
              >
                <Text style={styles.memberInitial}>{initial}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      {overflow > 0 ? (
        <View
          style={[
            styles.overflow,
            { marginLeft: -GROUP_HEADER_MEMBER_OVERLAP, zIndex: 0 },
          ]}
        >
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  const chip = GROUP_HEADER_MEMBER_CHIP;
  const chipR = chip / 2;
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexShrink: 1,
      minWidth: 0,
    },
    memberPressable: {},
    memberAvatar: {
      width: chip,
      height: chip,
      borderRadius: chipR,
      borderWidth: 2,
    },
    memberAvatarPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberInitial: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
    },
    overflow: {
      minWidth: chip,
      height: chip,
      borderRadius: chipR,
      backgroundColor: colors.inputBackgroundSolid,
      borderWidth: 2,
      borderColor: colors.toolbar,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    overflowText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
}

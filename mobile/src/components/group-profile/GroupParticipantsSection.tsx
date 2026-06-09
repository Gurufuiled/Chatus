import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { resolveAvatarUrl } from '../../config';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';
import type { GroupMember } from './groupProfile.types';

type GroupParticipantsSectionProps = {
  isOwner: boolean;
  currentUserId: string | null;
  members: GroupMember[];
  onAddMembers: () => void;
  onOpenMemberMenu: (member: GroupMember, left: number, top: number) => void;
};

type BadgeStyle = {
  bubble: string;
  text: string;
};

const TAG_STYLES: Record<string, BadgeStyle> = {
  blue: { bubble: 'rgba(91, 141, 239, 0.16)', text: '#4C7FE5' },
  green: { bubble: 'rgba(84, 177, 115, 0.16)', text: '#3F9960' },
  orange: { bubble: 'rgba(243, 154, 74, 0.18)', text: '#D8822D' },
  red: { bubble: 'rgba(230, 108, 122, 0.18)', text: '#CC5563' },
};

function getDisplayNameFromMember(member: GroupMember) {
  return (
    member.user?.display_name?.trim() ||
    member.user?.username?.trim() ||
    member.user?.handle?.trim() ||
    'Пользователь'
  );
}

function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'в сети';
  if (lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function getRoleLabel(role?: string) {
  if (role === 'owner') return 'владелец';
  if (role === 'admin') return 'админ';
  return null;
}

function getRoleBadgeStyle(role?: string) {
  if (role === 'owner') {
    return {
      container: { backgroundColor: 'rgba(186, 140, 255, 0.18)' },
      text: { color: '#9B69E2' },
    };
  }

  return {
    container: { backgroundColor: 'rgba(103, 198, 128, 0.16)' },
    text: { color: '#45A768' },
  };
}

function getTagStyle(color?: string | null): BadgeStyle {
  if (!color) return TAG_STYLES.blue;
  return TAG_STYLES[color] ?? TAG_STYLES.blue;
}

export const GroupParticipantsSection = React.memo(function GroupParticipantsSection({
  isOwner,
  currentUserId,
  members,
  onAddMembers,
  onOpenMemberMenu,
}: GroupParticipantsSectionProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createParticipantsStyles(themeColors), [themeColors]);

  return (
    <View style={styles.sectionCard}>
      {isOwner ? (
        <Pressable
          onPress={onAddMembers}
          style={({ pressed }) => [styles.addMemberButton, pressed && styles.cardPressed]}
        >
          <View style={styles.addMemberIconWrap}>
            <Feather name="user-plus" size={18} color={themeColors.accent} />
          </View>
          <Text style={styles.addMemberButtonText}>Добавить участников</Text>
        </Pressable>
      ) : null}

      {members.map((member) => {
        const roleLabel = getRoleLabel(member.role);
        const roleStyles = getRoleBadgeStyle(member.role);
        const memberName = getDisplayNameFromMember(member);
        const memberAvatar = resolveAvatarUrl(member.user?.avatar_url ?? null);
        const status = formatPresence(member.user?.is_online, member.user?.last_seen);
        const canOpenMemberMenu = member.user_id !== currentUserId;
        const memberTag = member.tag?.trim() || null;
        const memberTagStyle = getTagStyle(member.tag_color);

        return (
          <Pressable
            key={member.user_id}
            delayLongPress={220}
            disabled={!canOpenMemberMenu}
            onLongPress={(event) => {
              if (!canOpenMemberMenu) return;
              onOpenMemberMenu(
                member,
                event.nativeEvent.pageX - 30,
                event.nativeEvent.pageY - 16
              );
            }}
            style={({ pressed }) => [styles.memberRow, pressed && styles.memberRowPressed]}
          >
            {memberAvatar ? (
              <Image
                source={{ uri: memberAvatar }}
                cachePolicy="disk"
                contentFit="cover"
                style={styles.memberAvatar}
              />
            ) : (
              <View style={styles.memberAvatarFallback}>
                <Text style={styles.memberAvatarFallbackText}>
                  {(memberName.trim()[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}

            <View style={styles.memberInfo}>
              <View style={styles.memberNameRow}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {memberName}
                </Text>
              </View>
              <Text style={styles.memberStatus}>{status}</Text>
            </View>

            {memberTag || roleLabel ? (
              <View style={styles.memberBadges}>
                {memberTag ? (
                  <View
                    style={[
                      styles.roleBadge,
                      styles.memberTagBadge,
                      { backgroundColor: memberTagStyle.bubble },
                    ]}
                  >
                    <Text
                      style={[styles.roleBadgeText, { color: memberTagStyle.text }]}
                      numberOfLines={1}
                    >
                      {memberTag}
                    </Text>
                  </View>
                ) : null}

                {roleLabel ? (
                  <View style={[styles.roleBadge, roleStyles.container]}>
                    <Text style={[styles.roleBadgeText, roleStyles.text]}>{roleLabel}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
});

function createParticipantsStyles(c: ThemeColors) {
  return StyleSheet.create({
  sectionCard: {
    marginTop: 14,
    borderRadius: 26,
    backgroundColor: c.inputBackgroundSolid,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.separator,
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  addMemberIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(c.accent, 0.12),
    marginRight: 12,
  },
  addMemberButtonText: {
    fontSize: 17,
    fontWeight: '500',
    color: c.accent,
  },
  memberRow: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  memberRowPressed: {
    backgroundColor: c.rowPressed,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  memberAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(c.accent, 0.22),
  },
  memberAvatarFallbackText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: c.textPrimary,
  },
  memberStatus: {
    marginTop: 3,
    fontSize: 14,
    color: c.textSecondary,
  },
  memberBadges: {
    marginLeft: 12,
    alignItems: 'flex-end',
    gap: 6,
    maxWidth: 124,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  memberTagBadge: {
    maxWidth: 124,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardPressed: {
    opacity: 0.84,
  },
  });
}


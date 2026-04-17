import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, updateChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';
import { resolveAvatarUrl } from '../config';

type Route = RouteProp<ChatsStackParamList, 'ChannelSettings'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelSettings'>;

/* ─── Row Component ───
 * Non-interactive rows must use <View style={[...]}> — never pass a style *function* to View
 * (Pressable accepts it; View ignores it and breaks flexDirection: 'row').
 */

function SettingsRow({
  icon,
  iconColor,
  title,
  value,
  onPress,
  trailing,
  disabled,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor?: string;
  title: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  const isInteractive = !!onPress && !disabled;
  const content = (
    <>
      <View style={[styles.rowIconWrap, { backgroundColor: iconColor ?? colors.accent }]}>
        <Feather name={icon} size={17} color="#FFFFFF" />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      {trailing ?? null}
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress && !trailing ? (
        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
      ) : null}
    </>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
          disabled && styles.rowDisabled,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>{content}</View>
  );
}

function SectionSeparator() {
  return <View style={styles.sectionSeparator} />;
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

/* ─── Main Screen ─── */

export function ChannelSettingsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const [loading, setLoading] = React.useState(!detail);
  const [snackbar, setSnackbar] = React.useState<string | null>(null);

  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar(message);
  }, []);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchChannelDetail(channelId);
      channelStore.getState().setDetail(channelId, next);
      chatStore.getState().addOrUpdateChat(next.channel);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const canEdit = detail?.channel_permissions?.can_edit_channel === true;
  const canAdminOps =
    detail?.channel_permissions?.can_add_admins === true ||
    detail?.channel_permissions?.can_remove_admins === true ||
    detail?.channel_permissions?.can_edit_admin_permissions === true ||
    detail?.channel_permissions?.can_manage_admins === true;
  const canModerate = detail?.channel_permissions?.can_moderate_subscribers === true;

  const channel = detail?.channel;
  const avatarUrl = resolveAvatarUrl(channel?.avatar_url ?? null);
  const title = channel?.name?.trim() || 'Канал';
  const initial = (title[0] || 'К').toUpperCase();

  /* ─── Reactions toggle (inline) ─── */
  const [allowReactions, setAllowReactions] = React.useState(channel?.allow_reactions !== 0);

  React.useEffect(() => {
    if (channel) {
      setAllowReactions(channel.allow_reactions !== 0);
    }
  }, [channel?.allow_reactions]);

  const handleToggleReactions = React.useCallback(
    async (value: boolean) => {
      if (!canEdit) return showSnackbar('Недостаточно прав');
      setAllowReactions(value);
      try {
        const updated = await updateChannel(channelId, { allow_reactions: value });
        channelStore.getState().upsertChannel(updated);
        chatStore.getState().addOrUpdateChat(updated);
      } catch (error) {
        setAllowReactions(!value);
        Alert.alert('Ошибка', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
      }
    },
    [canEdit, channelId, showSnackbar],
  );

  if (loading && !detail) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!detail || !channel) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>Канал недоступен</Text>
      </View>
    );
  }

  const adminCount = (channel.members ?? []).filter(
    (m) => m.role === 'owner' || m.role === 'admin',
  ).length;
  const subscriberCount = channel.subscriber_count ?? 0;
  const visibilityLabel = channel.visibility === 'private' ? 'Частный' : 'Публичный';

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ─── Channel header card ─── */}
        <View style={styles.channelCard}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.channelInfo}>
            <Text style={styles.channelName} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.channelSub}>{subscriberCount} подписчиков</Text>
          </View>
        </View>

        <SectionSeparator />

        {/* ─── Section 1: Settings ─── */}
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="globe"
            iconColor="#007AFF"
            title="Тип канала"
            value={visibilityLabel}
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return showSnackbar('Недостаточно прав для настроек канала');
              navigation.navigate('ChannelType', { channelId });
            }}
          />
          <RowDivider />
          <SettingsRow
            icon="message-circle"
            iconColor="#34C759"
            title="Обсуждение"
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return showSnackbar('Недостаточно прав для настроек канала');
              navigation.navigate('ChannelDiscussionSettings', { channelId });
            }}
          />
          <RowDivider />
          <SettingsRow
            icon="heart"
            iconColor="#FF3B30"
            title="Реакции"
            disabled={!canEdit}
            trailing={
              <Switch
                value={allowReactions}
                onValueChange={(v) => void handleToggleReactions(v)}
                disabled={!canEdit}
              />
            }
          />
        </View>

        <SectionSeparator />

        {/* ─── Section 2: Members ─── */}
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="shield"
            iconColor="#5856D6"
            title="Администраторы"
            value={String(adminCount)}
            disabled={!canAdminOps}
            onPress={() => {
              if (!canAdminOps) return showSnackbar('Недостаточно прав для управления администраторами');
              navigation.navigate('ChannelMembers', { channelId, mode: 'admins' });
            }}
          />
          <RowDivider />
          <SettingsRow
            icon="users"
            iconColor="#007AFF"
            title="Подписчики"
            value={String(subscriberCount)}
            disabled={!canModerate && !canAdminOps}
            onPress={() => {
              if (!canModerate && !canAdminOps) {
                return showSnackbar('Недостаточно прав для просмотра подписчиков');
              }
              navigation.navigate('ChannelMembers', { channelId, mode: 'subscribers' });
            }}
          />
          <RowDivider />
          <SettingsRow
            icon="slash"
            iconColor="#FF9500"
            title="Чёрный список"
            disabled={!canModerate && !canAdminOps}
            onPress={() => {
              if (!canModerate && !canAdminOps) {
                return showSnackbar('Недостаточно прав');
              }
              navigation.navigate('ChannelMembers', { channelId, mode: 'banned' });
            }}
          />
        </View>

        {(!canEdit || !canAdminOps || !canModerate) ? (
          <View style={styles.permissionBanner}>
            <Feather name="lock" size={14} color="#92400E" />
            <Text style={styles.permissionHint}>
              Некоторые разделы доступны в зависимости от ваших прав администратора.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F0F5' },
  container: { flex: 1, backgroundColor: '#F0F0F5' },
  content: { paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F0F5' },
  errorText: { color: colors.textSecondary, fontSize: 16 },

  /* Channel header card */
  channelCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6D6D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  avatarText: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' },
  channelInfo: { flex: 1 },
  channelName: { fontSize: 20, fontWeight: '600', color: '#111827' },
  channelSub: { marginTop: 2, fontSize: 14, color: '#6B7280' },

  /* Section cards */
  sectionSeparator: { height: 16 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },

  /* Rows */
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowPressed: { backgroundColor: '#F5F6F8' },
  rowDisabled: { opacity: 0.55 },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowTitle: { fontSize: 17, color: '#111827' },
  rowValue: { fontSize: 16, color: '#8E8E93', marginRight: 4 },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E4E8',
    marginLeft: 56,
  },

  /* Permission banner */
  permissionBanner: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permissionHint: { color: '#92400E', fontSize: 13, flex: 1 },

  /* Snackbar */
  snackbarWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    backgroundColor: 'rgba(239,246,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  snackbarText: { color: '#1E40AF', textAlign: 'center', fontWeight: '700' },
});

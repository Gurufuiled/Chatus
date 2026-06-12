import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { resolveAvatarUrl } from '../config';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, updateChannel } from '../services/channelService';
import { authStore } from '../stores/authStore';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

type Route = RouteProp<ChatsStackParamList, 'ChannelSettings'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelSettings'>;

type ChannelSettingsStyles = ReturnType<typeof createChannelSettingsStyles>;

function createChannelSettingsStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.chatBackground },
    container: { flex: 1, backgroundColor: c.chatBackground },
    content: { paddingBottom: 40 },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.chatBackground,
    },
    errorText: { color: c.textSecondary, fontSize: 16 },

    channelCard: {
      backgroundColor: c.inputBackgroundSolid,
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
    channelName: { fontSize: 20, fontWeight: '600', color: c.textPrimary },
    channelSub: { marginTop: 2, fontSize: 14, color: c.textSecondary },

    sectionSeparator: { height: 16 },
    sectionCard: {
      backgroundColor: c.inputBackgroundSolid,
      marginHorizontal: 16,
      borderRadius: 16,
      overflow: 'hidden',
    },

    row: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 12,
    },
    rowPressed: { backgroundColor: c.rowPressed },
    rowDisabled: { opacity: 0.55 },
    rowIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, justifyContent: 'center' },
    rowTitle: { fontSize: 17, color: c.textPrimary },
    rowValue: { fontSize: 16, color: c.textSecondary, marginRight: 4 },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 56,
    },

    permissionBanner: {
      marginTop: 16,
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: withAlpha('#F59E0B', 0.2),
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    permissionHint: { color: c.textPrimary, fontSize: 13, flex: 1 },

    sectionCaption: {
      marginTop: 6,
      marginHorizontal: 20,
      fontSize: 12,
      color: c.textSecondary,
      lineHeight: 16,
    },

    snackbarWrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 14,
      backgroundColor: withAlpha(c.accent, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(c.accent, 0.35),
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: c.accent,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    snackbarText: { color: c.link, textAlign: 'center', fontWeight: '700' },
  });
}

function SettingsRow({
  st,
  icon,
  iconColor,
  title,
  value,
  onPress,
  trailing,
  disabled,
  accentFallback,
  textSecondary,
}: {
  st: ChannelSettingsStyles;
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor?: string;
  title: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  accentFallback: string;
  textSecondary: string;
}) {
  const isInteractive = !!onPress && !disabled;
  const content = (
    <>
      <View style={[st.rowIconWrap, { backgroundColor: iconColor ?? accentFallback }]}>
        <Feather name={icon} size={17} color="#FFFFFF" />
      </View>
      <View style={st.rowBody}>
        <Text style={st.rowTitle}>{title}</Text>
      </View>
      {trailing ?? null}
      {value ? <Text style={st.rowValue}>{value}</Text> : null}
      {onPress && !trailing ? (
        <Feather name="chevron-right" size={18} color={textSecondary} />
      ) : null}
    </>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          st.row,
          pressed && st.rowPressed,
          disabled && st.rowDisabled,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[st.row, disabled && st.rowDisabled]}>{content}</View>;
}

function SectionSeparator({ st }: { st: ChannelSettingsStyles }) {
  return <View style={st.sectionSeparator} />;
}

function RowDivider({ st }: { st: ChannelSettingsStyles }) {
  return <View style={st.rowDivider} />;
}

export function ChannelSettingsScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelSettingsStyles(c), [c]);
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

  const currentUserId = authStore((state) => state.user?.id ?? null);
  const isOwner = React.useMemo(() => {
    if (!detail || !currentUserId) return false;
    const me = detail.channel.members?.find((m) => m.user_id === currentUserId);
    return me?.role === 'owner';
  }, [detail, currentUserId]);
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
        <ActivityIndicator size="large" color={c.accent} />
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
        <View style={styles.channelCard}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              contentFit="cover"
              cachePolicy="disk"
            />
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

        <SectionSeparator st={styles} />

        <View style={styles.sectionCard}>
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
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
          <RowDivider st={styles} />
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
            icon="link"
            iconColor="#FF9500"
            title="Пригласительные ссылки"
            value="1"
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return showSnackbar('Недостаточно прав для настроек канала');
              navigation.navigate('ChannelInviteLinks', { channelId });
            }}
          />
          <RowDivider st={styles} />
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
            icon="message-circle"
            iconColor="#34C759"
            title="Обсуждение"
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return showSnackbar('Недостаточно прав для настроек канала');
              navigation.navigate('ChannelDiscussionSettings', { channelId });
            }}
          />
          <RowDivider st={styles} />
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
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

        {isOwner ? (
          <>
            <SectionSeparator st={styles} />
            <View style={styles.sectionCard}>
              <SettingsRow
                st={styles}
                accentFallback={c.accent}
                textSecondary={c.textSecondary}
                icon="trending-up"
                iconColor="#16A34A"
                title="Монетизация"
                value="Демо"
                onPress={() => navigation.navigate('ChannelMonetization', { channelId })}
              />
            </View>
            <Text style={styles.sectionCaption}>
              Платные подписки, статистика и выплаты. Доступно только владельцу канала.
            </Text>
          </>
        ) : null}

        <SectionSeparator st={styles} />

        <View style={styles.sectionCard}>
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
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
          <RowDivider st={styles} />
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
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
          <RowDivider st={styles} />
          <SettingsRow
            st={styles}
            accentFallback={c.accent}
            textSecondary={c.textSecondary}
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

        {!canEdit || !canAdminOps || !canModerate ? (
          <View style={styles.permissionBanner}>
            <Feather name="lock" size={14} color={c.textSecondary} />
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

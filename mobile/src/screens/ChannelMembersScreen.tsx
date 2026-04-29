import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  type AlertButton,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import {
  banChannelMember,
  fetchChannelDetail,
  fetchChannelMembers,
  removeChannelMember,
  unbanChannelMember,
  type ChannelMemberItem,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { resolveAvatarUrl } from '../config';

type Route = RouteProp<ChatsStackParamList, 'ChannelMembers'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelMembers'>;

export function ChannelMembersScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelMembersStyles(c), [c]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId, mode } = route.params;
  const detail = channelStore((s) => s.detailsById[channelId]);
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<ChannelMemberItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchChannelMembers(channelId, {
        role: mode === 'admins' ? 'admin' : 'subscriber',
        query,
        include_banned: mode === 'subscribers' || mode === 'banned',
      });
      const filtered =
        mode === 'banned'
          ? result.items.filter((m) => m.is_banned)
          : result.items;
      setItems(filtered);
      channelStore.getState().setMembersByKey(`${channelId}:${mode}:${query}`, {
        items: filtered,
        next_cursor: result.next_cursor,
      });
    } finally {
      setLoading(false);
    }
  }, [channelId, mode, query]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const canManageAdmins = detail?.channel_permissions?.can_manage_admins === true;
  const canAddAdmins = detail?.channel_permissions?.can_add_admins === true;
  const canRemoveAdmins = detail?.channel_permissions?.can_remove_admins === true;
  const canEditAdminPermissions =
    detail?.channel_permissions?.can_edit_admin_permissions === true;
  const canAdminOps = canManageAdmins || canAddAdmins || canRemoveAdmins || canEditAdminPermissions;
  const canModerate = detail?.channel_permissions?.can_moderate_subscribers === true;

  React.useEffect(() => {
    navigation.setOptions({
      title:
        mode === 'admins'
          ? 'Администраторы'
          : mode === 'banned'
            ? 'Чёрный список'
            : 'Подписчики',
      headerBackTitle: 'Назад',
      headerRight:
        mode === 'admins' && canAddAdmins
          ? () => (
              <Pressable
                onPress={() => navigation.navigate('ChannelAddAdmin', { channelId })}
                style={({ pressed }) => [
                  styles.addAdminButton,
                  pressed && styles.addAdminButtonPressed,
                ]}
              >
                <Feather name="plus" size={18} color={c.accent} />
              </Pressable>
            )
          : undefined,
    });
  }, [canAddAdmins, channelId, mode, navigation, styles, c.accent]);

  const refreshChannelDetail = React.useCallback(async () => {
    const next = await fetchChannelDetail(channelId);
    channelStore.getState().setDetail(channelId, next);
    channelStore.getState().upsertChannel(next.channel);
    chatStore.getState().addOrUpdateChat(next.channel);
  }, [channelId]);

  const handleAdminRowAction = React.useCallback(
    (item: ChannelMemberItem) => {
      if (!canAdminOps) return;
      navigation.navigate('ChannelAdminPermissions', {
        channelId,
        memberId: item.user_id,
        memberName: item.user?.display_name || item.user?.username || item.user_id,
        memberAvatarUrl: item.user?.avatar_url ?? null,
      });
    },
    [canAdminOps, channelId, navigation],
  );

  const handleSubscriberActions = React.useCallback(
    (item: ChannelMemberItem) => {
      if (!canModerate || item.role !== 'member') return;

      const actions: AlertButton[] = [];

      if (!item.is_banned && canAddAdmins) {
        actions.push({
          text: 'Назначить администратором',
          onPress: () => {
            navigation.navigate('ChannelAddAdmin', {
              channelId,
              memberId: item.user_id,
              memberName: item.user?.display_name || item.user?.username || item.user_id,
            });
          },
        });
      }

      actions.push(
        item.is_banned
          ? {
              text: 'Разбанить',
              onPress: () => {
                void (async () => {
                  setBusyUserId(item.user_id);
                  try {
                    const updated = await unbanChannelMember(channelId, item.user_id);
                    channelStore.getState().upsertChannel(updated);
                    await refreshChannelDetail();
                    await load();
                  } finally {
                    setBusyUserId(null);
                  }
                })();
              },
            }
          : {
              text: 'Заблокировать',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  setBusyUserId(item.user_id);
                  try {
                    const updated = await banChannelMember(channelId, item.user_id);
                    channelStore.getState().upsertChannel(updated);
                    await refreshChannelDetail();
                    await load();
                  } finally {
                    setBusyUserId(null);
                  }
                })();
              },
            },
        {
          text: 'Удалить из канала',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyUserId(item.user_id);
              try {
                const updated = await removeChannelMember(channelId, item.user_id);
                channelStore.getState().upsertChannel(updated);
                await refreshChannelDetail();
                await load();
              } finally {
                setBusyUserId(null);
              }
            })();
          },
        },
        { text: 'Отмена', style: 'cancel' },
      );

      Alert.alert('Модерация', 'Выберите действие', actions);
    },
    [canAddAdmins, canModerate, channelId, load, navigation, refreshChannelDetail],
  );

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <Feather name="search" size={18} color={c.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
        placeholder={
            mode === 'admins'
              ? 'Поиск администраторов'
              : mode === 'banned'
                ? 'Поиск в чёрном списке'
                : 'Поиск подписчиков'
          }
          style={styles.searchInput}
          autoCapitalize="none"
        />
        <Pressable onPress={() => void load()} style={styles.searchButton}>
          <Text style={styles.searchButtonText}>Найти</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => {
            const title = item.user?.display_name || item.user?.username || item.user_id;
            const avatarUri = resolveAvatarUrl(item.user?.avatar_url ?? null);
            const subtitle =
              item.role === 'owner'
                ? 'Владелец'
                : item.role === 'admin'
                  ? 'Администратор'
                  : item.is_banned
                    ? 'Подписчик • заблокирован'
                    : 'Подписчик';
            return (
              <Pressable
                onPress={() => {
                  if (mode === 'admins') {
                    handleAdminRowAction(item);
                    return;
                  }
                  if (mode === 'banned') {
                    Alert.alert(
                      'Разблокировать?',
                      `Разблокировать ${title}?`,
                      [
                        { text: 'Отмена', style: 'cancel' },
                        {
                          text: 'Разблокировать',
                          onPress: () => {
                            void (async () => {
                              setBusyUserId(item.user_id);
                              try {
                                const updated = await unbanChannelMember(channelId, item.user_id);
                                channelStore.getState().upsertChannel(updated);
                                await refreshChannelDetail();
                                await load();
                              } finally {
                                setBusyUserId(null);
                              }
                            })();
                          },
                        },
                      ],
                    );
                    return;
                  }
                  handleSubscriberActions(item);
                }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(title[0] || '?').toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowSubtitle}>{subtitle}</Text>
                </View>
                {busyUserId === item.user_id ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Feather name="chevron-right" size={18} color={c.textSecondary} />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Ничего не найдено</Text>}
        />
      )}
    </View>
  );
}

function createChannelMembersStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.chatBackground },
    search: {
      margin: 12,
      borderRadius: 12,
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.composerBorder,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: { flex: 1, minHeight: 42, color: c.textPrimary },
    searchButton: {
      paddingHorizontal: 10,
      height: 30,
      borderRadius: 8,
      backgroundColor: withAlpha(c.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchButtonText: { color: c.accent, fontWeight: '700', fontSize: 12 },
    addAdminButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: withAlpha(c.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    addAdminButtonPressed: { opacity: 0.78 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      backgroundColor: c.inputBackgroundSolid,
    },
    rowPressed: { backgroundColor: c.rowPressed },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withAlpha(c.accent, 0.2),
    },
    avatarText: { color: '#FFFFFF', fontWeight: '700' },
    rowText: { flex: 1, marginLeft: 10 },
    rowTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    rowSubtitle: { marginTop: 2, color: c.textSecondary, fontSize: 13 },
    empty: { marginTop: 24, textAlign: 'center', color: c.textSecondary },
  });
}


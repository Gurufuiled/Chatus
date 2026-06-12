import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchChannelDetail,
  fetchChannelMembers,
  updateChannelMemberRolePermissions,
} from '../services/channelService';
import { resolveAvatarUrl } from '../config';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

type Route = RouteProp<ChatsStackParamList, 'ChannelAdminPermissions'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelAdminPermissions'>;

function createChannelAdminPermissionsStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.chatBackground, padding: 12, paddingBottom: 24 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chatBackground },
    noRightsContainer: { flex: 1, backgroundColor: c.chatBackground, padding: 16, justifyContent: 'center' },
    noRightsCard: {
      borderRadius: 14,
      backgroundColor: withAlpha('#F59E0B', 0.2),
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    noRightsTextWrap: { flex: 1 },
    noRightsTitle: { color: c.textPrimary, fontWeight: '800', marginBottom: 2 },
    noRightsText: { color: c.textSecondary },
    memberCard: {
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    memberCardHeader: { flexDirection: 'row', alignItems: 'center' },
    memberCardText: { flex: 1 },
    memberAvatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12, backgroundColor: withAlpha(c.accent, 0.2) },
    memberAvatarFallback: {
      width: 52,
      height: 52,
      borderRadius: 26,
      marginRight: 12,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 19 },
    memberName: { color: c.textPrimary, fontSize: 18, fontWeight: '700' },
    memberRole: { color: c.textSecondary, marginTop: 4 },
    sectionLabel: { marginBottom: 8, color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    sectionCard: { backgroundColor: c.inputBackgroundSolid, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
    sectionCardDisabled: { opacity: 0.75 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      minHeight: 54,
    },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    sectionTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '500' },
    sectionCount: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },
    sectionItems: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    sectionItemRow: {
      minHeight: 44,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    sectionItemRowPressed: { backgroundColor: c.rowPressed },
    sectionItemRowDisabled: { opacity: 0.65 },
    sectionItemText: { color: c.textPrimary, fontSize: 14 },
    singleRow: {
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    singleRowDisabled: { opacity: 0.7 },
    singleRowText: { color: c.textPrimary, fontSize: 17, fontWeight: '500', flex: 1, paddingRight: 10 },
    saveButton: {
      marginTop: 6,
      height: 50,
      borderRadius: 14,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonPressed: { opacity: 0.86 },
    saveButtonDisabled: { opacity: 0.65 },
    saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    dangerButton: {
      marginTop: 10,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha('#DC2626', 0.18),
    },
    dangerText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
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

type AdminPermStyles = ReturnType<typeof createChannelAdminPermissionsStyles>;

type SectionProps = {
  st: AdminPermStyles;
  accent: string;
  mutedIcon: string;
  title: string;
  value: boolean;
  expanded: boolean;
  countLabel: string;
  onToggleValue: (next: boolean) => void;
  onToggleExpand: () => void;
  onToggleItem: (id: string) => void;
  items: Array<{ id: string; label: string; enabled: boolean; disabled?: boolean }>;
  disabled?: boolean;
};

function Section({
  st,
  accent,
  mutedIcon,
  title,
  value,
  expanded,
  countLabel,
  onToggleValue,
  onToggleExpand,
  onToggleItem,
  items,
  disabled,
}: SectionProps) {
  return (
    <View style={[st.sectionCard, disabled && st.sectionCardDisabled]}>
      <View style={st.sectionHeader}>
        <Pressable onPress={onToggleExpand} style={st.sectionHeaderLeft}>
          <Text style={st.sectionTitle}>{title}</Text>
          <Text style={st.sectionCount}>{countLabel}</Text>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={mutedIcon} />
        </Pressable>
        <Switch value={value} onValueChange={onToggleValue} disabled={disabled} />
      </View>
      {expanded ? (
        <View style={st.sectionItems}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onToggleItem(item.id)}
              disabled={disabled || item.disabled}
              style={({ pressed }) => [
                st.sectionItemRow,
                (disabled || item.disabled) && st.sectionItemRowDisabled,
                pressed && !disabled && !item.disabled && st.sectionItemRowPressed,
              ]}
            >
              <Feather
                name={item.enabled ? 'check-circle' : 'circle'}
                size={16}
                color={item.enabled ? accent : mutedIcon}
              />
              <Text style={st.sectionItemText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function localizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (!raw) return 'Попробуйте еще раз.';
  if (raw.includes('You cannot change your own admin role')) {
    return 'Нельзя изменять собственные права администратора.';
  }
  if (raw.includes('Нельзя изменять собственные права администратора')) {
    return 'Нельзя изменять собственные права администратора.';
  }
  return raw;
}

function isSelfAdminRightsError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : '';
  if (!raw) return false;
  return raw.includes('You cannot change your own admin role') || raw.includes('Нельзя изменять собственные права администратора');
}

export function ChannelAdminPermissionsScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelAdminPermissionsStyles(c), [c]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId, memberId, memberName, memberAvatarUrl } = route.params;
  const detail = channelStore((s) => s.detailsById[channelId]);

  const actorCanEditAdminPermissions =
    detail?.channel_permissions?.can_edit_admin_permissions === true;
  const actorCanRemoveAdmins = detail?.channel_permissions?.can_remove_admins === true;

  const [hydratingDetail, setHydratingDetail] = React.useState(!detail);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [role, setRole] = React.useState<'owner' | 'admin' | 'member'>('member');
  const [displayName, setDisplayName] = React.useState(memberName ?? 'Администратор');
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(
    resolveAvatarUrl(memberAvatarUrl ?? null),
  );

  const [canPost, setCanPost] = React.useState(true);
  const [canModerateSubscribers, setCanModerateSubscribers] = React.useState(false);

  const [profileExpanded, setProfileExpanded] = React.useState(true);
  const [canEditChannelAvatar, setCanEditChannelAvatar] = React.useState(true);
  const [canEditChannelName, setCanEditChannelName] = React.useState(true);
  const [canEditChannelDescription, setCanEditChannelDescription] = React.useState(true);

  const [adminsExpanded, setAdminsExpanded] = React.useState(true);
  const [canAddAdmins, setCanAddAdmins] = React.useState(false);
  const [canRemoveAdmins, setCanRemoveAdmins] = React.useState(false);
  const [canEditAdminPermissions, setCanEditAdminPermissions] = React.useState(false);

  const [snackbar, setSnackbar] = React.useState<string | null>(null);
  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar(message);
  }, []);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Права администратора',
      headerBackTitle: 'Назад',
    });
  }, [navigation]);

  React.useEffect(() => {
    if (detail) {
      setHydratingDetail(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchChannelDetail(channelId);
        channelStore.getState().setDetail(channelId, next);
        chatStore.getState().addOrUpdateChat(next.channel);
      } finally {
        if (!cancelled) setHydratingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, detail]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const members = await fetchChannelMembers(channelId, { role: 'admin', limit: 100 });
      const target = members.items.find((m) => m.user_id === memberId) ?? null;
      if (!target) {
        Alert.alert('Участник не найден', 'Администратор не найден в списке.');
        navigation.goBack();
        return;
      }

      const nextRole = target.role === 'owner' ? 'owner' : target.role === 'admin' ? 'admin' : 'member';
      setRole(nextRole);
      setDisplayName(target.user?.display_name || target.user?.username || memberName || target.user_id);
      const resolvedTargetAvatar = resolveAvatarUrl(target.user?.avatar_url ?? null);
      setAvatarUrl(resolvedTargetAvatar ?? resolveAvatarUrl(memberAvatarUrl ?? null));
      setCanPost(target.permissions.can_post);
      setCanModerateSubscribers(target.permissions.can_moderate_subscribers);

      setCanEditChannelAvatar(target.permissions.can_edit_channel_avatar);
      setCanEditChannelName(target.permissions.can_edit_channel_name);
      setCanEditChannelDescription(target.permissions.can_edit_channel_description);

      setCanAddAdmins(target.permissions.can_add_admins);
      setCanRemoveAdmins(target.permissions.can_remove_admins);
      setCanEditAdminPermissions(target.permissions.can_edit_admin_permissions);
    } catch (error) {
      Alert.alert('Ошибка', localizeErrorMessage(error));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [channelId, memberAvatarUrl, memberId, memberName, navigation]);

  React.useEffect(() => {
    if (hydratingDetail) return;
    if (!actorCanEditAdminPermissions) {
      setLoading(false);
      return;
    }
    void load();
  }, [actorCanEditAdminPermissions, hydratingDetail, load]);

  const isOwner = role === 'owner';
  const profileMaster = canEditChannelAvatar && canEditChannelName && canEditChannelDescription;
  const adminsMaster = canAddAdmins && canRemoveAdmins && canEditAdminPermissions;
  const profileCount =
    Number(canEditChannelAvatar) + Number(canEditChannelName) + Number(canEditChannelDescription);
  const adminsCount = Number(canAddAdmins) + Number(canRemoveAdmins) + Number(canEditAdminPermissions);
  const displayInitial = ((displayName || '?').trim().charAt(0) || '?').toUpperCase();

  const save = React.useCallback(async () => {
    if (!actorCanEditAdminPermissions) {
      return showSnackbar('Недостаточно прав для изменения прав администратора');
    }
    if (isOwner) return;
    setSaving(true);
    try {
      const updated = await updateChannelMemberRolePermissions(channelId, memberId, {
        role: 'admin',
        can_post: canPost,
        can_moderate_subscribers: canModerateSubscribers,
        can_edit_channel_avatar: canEditChannelAvatar,
        can_edit_channel_name: canEditChannelName,
        can_edit_channel_description: canEditChannelDescription,
        can_add_admins: canAddAdmins,
        can_remove_admins: canRemoveAdmins,
        can_edit_admin_permissions: canEditAdminPermissions,
        can_edit_channel: profileMaster,
        can_manage_admins: adminsMaster,
      });
      channelStore.getState().upsertChannel(updated);
      chatStore.getState().addOrUpdateChat(updated);
      const nextDetail = await fetchChannelDetail(channelId);
      channelStore.getState().setDetail(channelId, nextDetail);
      navigation.goBack();
    } catch (error) {
      if (isSelfAdminRightsError(error)) {
        showSnackbar('Нельзя изменять собственные права администратора');
      } else {
        Alert.alert('Не удалось сохранить', localizeErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }, [
    actorCanEditAdminPermissions,
    adminsMaster,
    canAddAdmins,
    canEditAdminPermissions,
    canEditChannelAvatar,
    canEditChannelDescription,
    canEditChannelName,
    canModerateSubscribers,
    canPost,
    canRemoveAdmins,
    channelId,
    isOwner,
    memberId,
    navigation,
    profileMaster,
    showSnackbar,
  ]);

  const demote = React.useCallback(() => {
    if (!actorCanRemoveAdmins) return showSnackbar('Недостаточно прав для снятия администратора');
    if (isOwner) return;
    Alert.alert('Снять администратора', `Снять ${displayName} с должности администратора?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Снять',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              const updated = await updateChannelMemberRolePermissions(channelId, memberId, {
                role: 'member',
              });
              channelStore.getState().upsertChannel(updated);
              chatStore.getState().addOrUpdateChat(updated);
              const nextDetail = await fetchChannelDetail(channelId);
              channelStore.getState().setDetail(channelId, nextDetail);
              navigation.goBack();
            } catch (error) {
              if (isSelfAdminRightsError(error)) {
                showSnackbar('Нельзя изменять собственные права администратора');
              } else {
                Alert.alert('Не удалось снять администратора', localizeErrorMessage(error));
              }
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }, [actorCanRemoveAdmins, channelId, displayName, isOwner, memberId, navigation, showSnackbar]);

  if (hydratingDetail || loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (!actorCanEditAdminPermissions) {
    return (
      <View style={styles.noRightsContainer}>
        <View style={styles.noRightsCard}>
          <Feather name="lock" size={16} color={c.textSecondary} />
          <View style={styles.noRightsTextWrap}>
            <Text style={styles.noRightsTitle}>Недостаточно прав</Text>
            <Text style={styles.noRightsText}>У вас нет прав на управление правами администраторов.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.memberCard}>
        <View style={styles.memberCardHeader}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.memberAvatar}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={styles.memberAvatarFallback}>
              <Text style={styles.memberAvatarText}>{displayInitial}</Text>
            </View>
          )}
          <View style={styles.memberCardText}>
            <Text style={styles.memberName}>{displayName}</Text>
            <Text style={styles.memberRole}>{isOwner ? 'Владелец канала' : 'Администратор'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>ВОЗМОЖНОСТИ АДМИНИСТРАТОРА</Text>

      <Section
        st={styles}
        accent={c.accent}
        mutedIcon={c.iconMuted}
        title="Изменение профиля канала"
        value={profileMaster}
        expanded={profileExpanded}
        countLabel={`${profileCount}/3`}
        onToggleExpand={() => setProfileExpanded((prev) => !prev)}
        onToggleValue={(next) => {
          setCanEditChannelAvatar(next);
          setCanEditChannelName(next);
          setCanEditChannelDescription(next);
        }}
        onToggleItem={(id) => {
          if (id === 'profile-avatar') setCanEditChannelAvatar((prev) => !prev);
          if (id === 'profile-name') setCanEditChannelName((prev) => !prev);
          if (id === 'profile-desc') setCanEditChannelDescription((prev) => !prev);
        }}
        items={[
          { id: 'profile-avatar', label: 'Изменение аватара канала', enabled: canEditChannelAvatar },
          { id: 'profile-name', label: 'Изменение названия канала', enabled: canEditChannelName },
          { id: 'profile-desc', label: 'Изменение описания канала', enabled: canEditChannelDescription },
        ]}
        disabled={isOwner || saving}
      />

      <Section
        st={styles}
        accent={c.accent}
        mutedIcon={c.iconMuted}
        title="Управление администраторами"
        value={adminsMaster}
        expanded={adminsExpanded}
        countLabel={`${adminsCount}/3`}
        onToggleExpand={() => setAdminsExpanded((prev) => !prev)}
        onToggleValue={(next) => {
          setCanAddAdmins(next);
          setCanRemoveAdmins(next);
          setCanEditAdminPermissions(next);
        }}
        onToggleItem={(id) => {
          if (id === 'admins-add') setCanAddAdmins((prev) => !prev);
          if (id === 'admins-remove') setCanRemoveAdmins((prev) => !prev);
          if (id === 'admins-edit') setCanEditAdminPermissions((prev) => !prev);
        }}
        items={[
          { id: 'admins-add', label: 'Назначение администратора', enabled: canAddAdmins },
          { id: 'admins-remove', label: 'Снятие администратора', enabled: canRemoveAdmins },
          { id: 'admins-edit', label: 'Управление правами администратора', enabled: canEditAdminPermissions },
        ]}
        disabled={isOwner || saving}
      />

      <View style={[styles.singleRow, isOwner && styles.singleRowDisabled]}>
        <Text style={styles.singleRowText}>Публикация постов</Text>
        <Switch value={canPost} onValueChange={setCanPost} disabled={isOwner || saving} />
      </View>

      <View style={[styles.singleRow, isOwner && styles.singleRowDisabled]}>
        <Text style={styles.singleRowText}>Модерация подписчиков</Text>
        <Switch
          value={canModerateSubscribers}
          onValueChange={setCanModerateSubscribers}
          disabled={isOwner || saving}
        />
      </View>

      {!isOwner ? (
        <>
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              saving && styles.saveButtonDisabled,
            ]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Сохранить</Text>}
          </Pressable>

          <Pressable onPress={demote} disabled={saving} style={styles.dangerButton}>
            <Text style={styles.dangerText}>Снять администратора</Text>
          </Pressable>
        </>
      ) : null}

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}


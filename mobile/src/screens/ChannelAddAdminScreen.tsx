import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchChannelMembers,
  updateChannelMemberRolePermissions,
  type ChannelMemberItem,
} from '../services/channelService';
import { resolveAvatarUrl } from '../config';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

type Route = RouteProp<ChatsStackParamList, 'ChannelAddAdmin'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelAddAdmin'>;

function createChannelAddAdminStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.chatBackground },
    content: { padding: 12, paddingBottom: 24 },
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
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    memberRow: {
      backgroundColor: c.inputBackgroundSolid,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    memberRowPressed: { backgroundColor: c.rowPressed },
    memberAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: withAlpha(c.accent, 0.2) },
    memberAvatarText: { color: '#FFFFFF', fontWeight: '700' },
    memberText: { flex: 1, marginLeft: 10 },
    memberName: { fontSize: 17, color: c.textPrimary, fontWeight: '600' },
    memberSubtitle: { marginTop: 2, color: c.textSecondary },
    selectedCard: {
      borderRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    changeButton: {
      paddingHorizontal: 10,
      height: 30,
      borderRadius: 8,
      backgroundColor: withAlpha(c.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    changeButtonText: { color: c.accent, fontWeight: '700', fontSize: 12 },
    sectionLabel: { marginBottom: 8, color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    sectionCard: { backgroundColor: c.inputBackgroundSolid, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
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
    singleRowText: { color: c.textPrimary, fontSize: 17, fontWeight: '500', flex: 1, paddingRight: 10 },
    addButton: {
      marginTop: 4,
      height: 50,
      borderRadius: 16,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonPressed: { opacity: 0.86 },
    addButtonDisabled: { opacity: 0.62 },
    addButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    noRightsContainer: { flex: 1, padding: 16, justifyContent: 'center', backgroundColor: c.chatBackground },
    noRightsCard: {
      borderRadius: 14,
      backgroundColor: withAlpha('#F59E0B', 0.2),
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    noRightsText: { color: c.textPrimary, fontWeight: '600', flex: 1 },
    empty: { marginTop: 24, textAlign: 'center', color: c.textSecondary },
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

type AddAdminStyles = ReturnType<typeof createChannelAddAdminStyles>;

type PermissionSectionProps = {
  st: AddAdminStyles;
  accent: string;
  mutedIcon: string;
  title: string;
  value: boolean;
  expanded: boolean;
  countLabel: string;
  onToggleValue: (next: boolean) => void;
  onToggleExpand: () => void;
  onToggleItem: (id: string) => void;
  items: Array<{ id: string; label: string; enabled: boolean }>;
};

function PermissionSection({
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
}: PermissionSectionProps) {
  return (
    <View style={st.sectionCard}>
      <View style={st.sectionHeader}>
        <Pressable onPress={onToggleExpand} style={st.sectionHeaderLeft}>
          <Text style={st.sectionTitle}>{title}</Text>
          <Text style={st.sectionCount}>{countLabel}</Text>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={mutedIcon} />
        </Pressable>
        <Switch value={value} onValueChange={onToggleValue} />
      </View>
      {expanded ? (
        <View style={st.sectionItems}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onToggleItem(item.id)}
              style={({ pressed }) => [st.sectionItemRow, pressed && st.sectionItemRowPressed]}
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

function UserAvatar({
  st,
  title,
  avatarUrl,
}: {
  st: AddAdminStyles;
  title: string;
  avatarUrl?: string | null;
}) {
  const resolvedAvatar = resolveAvatarUrl(avatarUrl ?? null);
  if (resolvedAvatar) {
    return <Image source={{ uri: resolvedAvatar }} style={st.memberAvatarImage} />;
  }
  return (
    <View style={st.memberAvatar}>
      <Text style={st.memberAvatarText}>{(title[0] || '?').toUpperCase()}</Text>
    </View>
  );
}

export function ChannelAddAdminScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelAddAdminStyles(c), [c]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId, memberId, memberName } = route.params;
  const detail = channelStore((s) => s.detailsById[channelId]);
  const canAddAdmins = detail?.channel_permissions?.can_add_admins === true;

  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [members, setMembers] = React.useState<ChannelMemberItem[]>([]);
  const [selectedMember, setSelectedMember] = React.useState<ChannelMemberItem | null>(null);
  const [snackbar, setSnackbar] = React.useState<string | null>(null);

  const [canPost, setCanPost] = React.useState(true);
  const [canModerateSubscribers, setCanModerateSubscribers] = React.useState(true);

  const [profileExpanded, setProfileExpanded] = React.useState(true);
  const [canEditChannelAvatar, setCanEditChannelAvatar] = React.useState(true);
  const [canEditChannelName, setCanEditChannelName] = React.useState(true);
  const [canEditChannelDescription, setCanEditChannelDescription] = React.useState(true);

  const [adminsExpanded, setAdminsExpanded] = React.useState(true);
  const [canAddOtherAdmins, setCanAddOtherAdmins] = React.useState(true);
  const [canRemoveAdmins, setCanRemoveAdmins] = React.useState(true);
  const [canEditAdminPermissions, setCanEditAdminPermissions] = React.useState(true);

  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar(message);
  }, []);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  React.useEffect(() => {
    navigation.setOptions({ title: 'Добавить администратора', headerBackTitle: 'Назад' });
  }, [navigation]);

  const loadMembers = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchChannelMembers(channelId, {
        role: 'subscriber',
        query,
        include_banned: false,
      });
      setMembers(result.items);
      if (memberId) {
        const found = result.items.find((item) => item.user_id === memberId) ?? null;
        if (found) setSelectedMember(found);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId, memberId, query]);

  React.useEffect(() => {
    if (!canAddAdmins) return;
    void loadMembers();
  }, [canAddAdmins, loadMembers]);

  const selectedTitle =
    selectedMember?.user?.display_name ||
    selectedMember?.user?.username ||
    memberName ||
    selectedMember?.user_id ||
    '';
  const profileMaster = canEditChannelAvatar && canEditChannelName && canEditChannelDescription;
  const adminsMaster = canAddOtherAdmins && canRemoveAdmins && canEditAdminPermissions;
  const profileCount =
    Number(canEditChannelAvatar) + Number(canEditChannelName) + Number(canEditChannelDescription);
  const adminsCount = Number(canAddOtherAdmins) + Number(canRemoveAdmins) + Number(canEditAdminPermissions);

  const handleAdd = React.useCallback(async () => {
    if (!canAddAdmins) return showSnackbar('Недостаточно прав для назначения администраторов');
    if (!selectedMember) return showSnackbar('Выберите подписчика');

    setSaving(true);
    try {
      const updated = await updateChannelMemberRolePermissions(channelId, selectedMember.user_id, {
        role: 'admin',
        can_post: canPost,
        can_manage_admins:
          canAddOtherAdmins && canRemoveAdmins && canEditAdminPermissions,
        can_edit_channel:
          canEditChannelAvatar && canEditChannelName && canEditChannelDescription,
        can_moderate_subscribers: canModerateSubscribers,
        can_edit_channel_avatar: canEditChannelAvatar,
        can_edit_channel_name: canEditChannelName,
        can_edit_channel_description: canEditChannelDescription,
        can_add_admins: canAddOtherAdmins,
        can_remove_admins: canRemoveAdmins,
        can_edit_admin_permissions: canEditAdminPermissions,
      });
      chatStore.getState().addOrUpdateChat(updated);
      showSnackbar('Администратор добавлен');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Не удалось добавить администратора', error instanceof Error ? error.message : 'Попробуйте еще раз.');
    } finally {
      setSaving(false);
    }
  }, [
    canAddAdmins,
    canAddOtherAdmins,
    canEditAdminPermissions,
    canEditChannelAvatar,
    canEditChannelDescription,
    canEditChannelName,
    canModerateSubscribers,
    canPost,
    canRemoveAdmins,
    channelId,
    navigation,
    selectedMember,
    showSnackbar,
  ]);

  if (!canAddAdmins) {
    return (
      <View style={styles.noRightsContainer}>
        <View style={styles.noRightsCard}>
          <Feather name="lock" size={16} color={c.textSecondary} />
          <Text style={styles.noRightsText}>Недостаточно прав для назначения администраторов.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!selectedMember ? (
        <>
          <View style={styles.search}>
            <Feather name="search" size={18} color={c.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск подписчика"
              style={styles.searchInput}
              autoCapitalize="none"
            />
            <Pressable onPress={() => void loadMembers()} style={styles.searchButton}>
              <Text style={styles.searchButtonText}>Найти</Text>
            </Pressable>
          </View>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={c.accent} />
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => item.user_id}
              renderItem={({ item }) => {
                const title = item.user?.display_name || item.user?.username || item.user_id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.memberRow, pressed && styles.memberRowPressed]}
                    onPress={() => setSelectedMember(item)}
                  >
                    <UserAvatar st={styles} title={title} avatarUrl={item.user?.avatar_url} />
                    <View style={styles.memberText}>
                      <Text style={styles.memberName}>{title}</Text>
                      <Text style={styles.memberSubtitle}>был(а) недавно</Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>Подписчики не найдены</Text>}
            />
          )}
        </>
      ) : (
        <View style={styles.content}>
          <View style={styles.selectedCard}>
            <UserAvatar st={styles} title={selectedTitle} avatarUrl={selectedMember?.user?.avatar_url} />
            <View style={styles.memberText}>
              <Text style={styles.memberName}>{selectedTitle}</Text>
              <Text style={styles.memberSubtitle}>был(а) недавно</Text>
            </View>
            <Pressable style={styles.changeButton} onPress={() => setSelectedMember(null)}>
              <Text style={styles.changeButtonText}>Изменить</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>ВОЗМОЖНОСТИ АДМИНИСТРАТОРА</Text>

          <PermissionSection
            st={styles}
            accent={c.accent}
            mutedIcon={c.iconMuted}
            title="Изменение профиля канала"
            value={profileMaster}
            expanded={profileExpanded}
            countLabel={`${profileCount}/3`}
            onToggleValue={(next) => {
              setCanEditChannelAvatar(next);
              setCanEditChannelName(next);
              setCanEditChannelDescription(next);
            }}
            onToggleExpand={() => setProfileExpanded((prev) => !prev)}
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
          />

          <PermissionSection
            st={styles}
            accent={c.accent}
            mutedIcon={c.iconMuted}
            title="Управление администраторами"
            value={adminsMaster}
            expanded={adminsExpanded}
            countLabel={`${adminsCount}/3`}
            onToggleValue={(next) => {
              setCanAddOtherAdmins(next);
              setCanRemoveAdmins(next);
              setCanEditAdminPermissions(next);
            }}
            onToggleExpand={() => setAdminsExpanded((prev) => !prev)}
            onToggleItem={(id) => {
              if (id === 'admins-add') setCanAddOtherAdmins((prev) => !prev);
              if (id === 'admins-remove') setCanRemoveAdmins((prev) => !prev);
              if (id === 'admins-edit') setCanEditAdminPermissions((prev) => !prev);
            }}
            items={[
              { id: 'admins-add', label: 'Назначение администратора', enabled: canAddOtherAdmins },
              { id: 'admins-remove', label: 'Снятие администратора', enabled: canRemoveAdmins },
              { id: 'admins-edit', label: 'Управление правами администратора', enabled: canEditAdminPermissions },
            ]}
          />

          <View style={styles.singleRow}>
            <Text style={styles.singleRowText}>Публикация постов</Text>
            <Switch value={canPost} onValueChange={setCanPost} />
          </View>

          <View style={styles.singleRow}>
            <Text style={styles.singleRowText}>Модерация подписчиков</Text>
            <Switch value={canModerateSubscribers} onValueChange={setCanModerateSubscribers} />
          </View>

          <Pressable
            onPress={() => void handleAdd()}
            disabled={saving}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
              saving && styles.addButtonDisabled,
            ]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.addButtonText}>Добавить</Text>}
          </Pressable>
        </View>
      )}

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}


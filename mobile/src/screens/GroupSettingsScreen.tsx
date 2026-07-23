import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { chatStore } from '../stores/chatStore';
import type { Chat } from '../stores/types';
import { deleteChat, updateGroupAdmin, type GroupAdminPermissionsPatch } from '../services/chatService';
import { ChatDao } from '../db';
import { messageStore } from '../stores/messageStore';
import {
  DEFAULT_GROUP_MEMBER_PERMISSIONS,
  getGroupInviteLink,
  getGroupSettings,
  recreateGroupInviteLink,
  revokeGroupInviteLink,
  updateGroupSettings,
  type GroupChatSettings,
  type GroupInviteLink,
  type GroupMemberPermissions,
} from '../services/groupSettingsService';

type GroupSettingsRoute = RouteProp<ChatsStackParamList, 'GroupSettings'>;
type GroupSettingsNavigation = NativeStackNavigationProp<ChatsStackParamList, 'GroupSettings'>;
type GroupMember = NonNullable<Chat['members']>[number];
type ViewMode = 'root' | 'member-permissions' | 'admins' | 'members' | 'admin-permissions';

type GroupAdminPermissions = Required<Omit<GroupAdminPermissionsPatch, 'role'>>;

const DEFAULT_ADMIN_PERMISSIONS: GroupAdminPermissions = {
  can_change_info: true,
  can_delete_messages: true,
  can_ban_users: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_manage_invite_links: true,
  can_manage_video_chats: true,
  can_add_admins: false,
};

const ADMIN_PERMISSION_ROWS: Array<{ key: keyof GroupAdminPermissions; title: string; subtitle: string }> = [
  { key: 'can_change_info', title: 'Изменять информацию', subtitle: 'Название, фото и описание группы' },
  { key: 'can_delete_messages', title: 'Удалять сообщения', subtitle: 'Модерация сообщений в чате' },
  { key: 'can_ban_users', title: 'Исключать участников', subtitle: 'Удаление участников из группы' },
  { key: 'can_invite_users', title: 'Приглашать пользователей', subtitle: 'Добавление новых участников' },
  { key: 'can_pin_messages', title: 'Закреплять сообщения', subtitle: 'Управление закреплениями' },
  { key: 'can_manage_invite_links', title: 'Управлять ссылками', subtitle: 'Создание и отзыв приглашений' },
  { key: 'can_manage_video_chats', title: 'Управлять видеочатами', subtitle: 'Запуск и настройка звонков' },
  { key: 'can_add_admins', title: 'Назначать администраторов', subtitle: 'Выдача прав другим участникам' },
];

const MEMBER_PERMISSION_ROWS: Array<{
  key: keyof GroupMemberPermissions;
  title: string;
  subtitle: string;
}> = [
  { key: 'can_send_messages', title: 'Отправлять сообщения', subtitle: 'Участники могут писать в группу' },
  { key: 'can_send_media', title: 'Отправлять медиа', subtitle: 'Фото, видео, файлы и голосовые' },
  { key: 'can_add_users', title: 'Добавлять участников', subtitle: 'Приглашать новых людей в группу' },
  { key: 'can_pin_messages', title: 'Закреплять сообщения', subtitle: 'Закрепление сообщений в чате' },
  { key: 'can_change_info', title: 'Изменять информацию', subtitle: 'Название, фото и описание группы' },
  { key: 'can_create_polls', title: 'Создавать опросы', subtitle: 'Публиковать опросы в группе' },
];

function inviteText(link: GroupInviteLink | null, settings: GroupChatSettings | null) {
  if (link?.invite_link?.trim()) return link.invite_link.trim();
  const token = link?.invite_token?.trim() || settings?.invite_token?.trim();
  return token ? `chatus://join/${token}` : '';
}

export function GroupSettingsScreen() {
  const route = useRoute<GroupSettingsRoute>();
  const navigation = useNavigation<GroupSettingsNavigation>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const chat = chatStore((state) => state.chatsMap[route.params.chatId]);
  const [mode, setMode] = useState<ViewMode>('root');
  const [selectedAdmin, setSelectedAdmin] = useState<GroupMember | null>(null);
  const [settings, setSettings] = useState<GroupChatSettings | null>(null);
  const [invite, setInvite] = useState<GroupInviteLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const canManageSettings = settings?.my_permissions?.is_admin === true || settings?.my_role === 'owner' || settings?.my_role === 'admin';
  const canManageInvite = settings?.my_permissions?.can_manage_invite_links === true;
  const canManageAdmins = settings?.my_permissions?.can_add_admins === true;
  const isOwner = settings?.my_permissions?.is_owner === true || settings?.my_role === 'owner';
  const displayedInvite = inviteText(invite, settings);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const members = useMemo(() => (chat?.members ?? []).slice().sort((a, b) => {
    const order = { owner: 0, admin: 1, member: 2 } as Record<string, number>;
    return (order[a.role ?? 'member'] ?? 3) - (order[b.role ?? 'member'] ?? 3);
  }), [chat?.members]);
  const administrators = useMemo(() => members.filter((member) => member.role === 'owner' || member.role === 'admin'), [members]);
  const adminPermissions = useMemo((): GroupAdminPermissions => ({
    ...DEFAULT_ADMIN_PERMISSIONS,
    ...(selectedAdmin?.admin_permissions ?? {}),
    can_add_admins: selectedAdmin?.role === 'owner' ? true : selectedAdmin?.admin_permissions?.can_add_admins ?? false,
  }), [selectedAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextSettings = await getGroupSettings(route.params.chatId);
      setSettings(nextSettings);
      if (nextSettings.my_permissions?.can_manage_invite_links) {
        setInvite(await getGroupInviteLink(route.params.chatId));
      } else {
        setInvite(null);
      }
    } catch (error) {
      Alert.alert('Не удалось открыть настройки', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }, [route.params.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = useCallback(async (key: string, apply: () => GroupChatSettings, patch: Parameters<typeof updateGroupSettings>[1]) => {
    if (!settings || savingKey) return;
    const previous = settings;
    setSavingKey(key);
    setSettings(apply());
    try {
      setSettings(await updateGroupSettings(route.params.chatId, patch));
    } catch (error) {
      setSettings(previous);
      Alert.alert('Не удалось сохранить', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      setSavingKey(null);
    }
  }, [route.params.chatId, savingKey, settings]);

  const toggleRoot = useCallback((key: 'hide_members' | 'restrict_saving_content') => {
    if (!settings) return;
    const next = !settings[key];
    void saveSettings(key, () => ({ ...settings, [key]: next }), { [key]: next });
  }, [saveSettings, settings]);

  const togglePermission = useCallback((key: keyof GroupMemberPermissions) => {
    if (!settings) return;
    const current = { ...DEFAULT_GROUP_MEMBER_PERMISSIONS, ...settings.member_permissions };
    const member_permissions = { ...current, [key]: !current[key] };
    void saveSettings(`permission-${key}`, () => ({ ...settings, member_permissions }), { member_permissions });
  }, [saveSettings, settings]);

  const copyInvite = useCallback(async () => {
    if (!displayedInvite) return;
    await Clipboard.setStringAsync(displayedInvite);
    Alert.alert('Скопировано', 'Пригласительная ссылка скопирована в буфер обмена.');
  }, [displayedInvite]);

  const revokeInvite = useCallback(() => {
    Alert.alert('Отозвать ссылку?', 'По старой ссылке больше нельзя будет вступить в группу.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отозвать', style: 'destructive', onPress: () => {
          setSavingKey('invite');
          void revokeGroupInviteLink(route.params.chatId)
            .then(setInvite)
            .catch((error) => Alert.alert('Не удалось отозвать ссылку', error instanceof Error ? error.message : 'Попробуйте ещё раз.'))
            .finally(() => setSavingKey(null));
        },
      },
    ]);
  }, [route.params.chatId]);

  const regenerateInvite = useCallback(() => {
    setSavingKey('invite');
    void recreateGroupInviteLink(route.params.chatId)
      .then(setInvite)
      .catch((error) => Alert.alert('Не удалось создать ссылку', error instanceof Error ? error.message : 'Попробуйте ещё раз.'))
      .finally(() => setSavingKey(null));
  }, [route.params.chatId]);

  const saveAdmin = useCallback(async (member: GroupMember, patch: GroupAdminPermissionsPatch) => {
    if (savingKey || member.role === 'owner') return;
    setSavingKey(`admin-${member.user_id}`);
    try {
      const updated = await updateGroupAdmin(route.params.chatId, member.user_id, patch);
      chatStore.getState().addOrUpdateChat(updated);
      const nextMember = updated.members?.find((candidate) => candidate.user_id === member.user_id) ?? null;
      setSelectedAdmin(nextMember);
    } catch (error) {
      Alert.alert('Не удалось сохранить права', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      setSavingKey(null);
    }
  }, [route.params.chatId, savingKey]);

  const promoteMember = useCallback((member: GroupMember) => {
    Alert.alert(
      'Назначить администратором?',
      `${memberName(member)} получит стандартный набор прав администратора.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Назначить', onPress: () => void saveAdmin(member, { role: 'admin' }) },
      ],
    );
  }, [saveAdmin]);

  const toggleAdminPermission = useCallback((key: keyof GroupAdminPermissions) => {
    if (!selectedAdmin) return;
    void saveAdmin(selectedAdmin, { [key]: !adminPermissions[key] });
  }, [adminPermissions, saveAdmin, selectedAdmin]);

  const deleteGroup = useCallback(() => {
    if (!chat) return;
    Alert.alert('Удалить группу?', 'Группа будет удалена для всех участников. Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteChat(chat.id);
              await new ChatDao().delete(chat.id);
              messageStore.getState().clearMessages(chat.id);
              chatStore.getState().removeChat(chat.id);
              navigation.navigate('ChatList');
            } catch (error) {
              Alert.alert('Не удалось удалить группу', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
            }
          })();
        },
      },
    ]);
  }, [chat, navigation]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable style={styles.backButton} onPress={() => {
        if (mode === 'root') navigation.goBack();
        else if (mode === 'admin-permissions') setMode('admins');
        else setMode('root');
      }} hitSlop={10}>
        <Feather name="chevron-left" size={28} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>{headerTitle(mode, selectedAdmin)}</Text>
      <View style={styles.headerSide} />
    </View>
  );

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  if (!settings || !canManageSettings) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.empty}><Feather name="lock" size={28} color={colors.iconMuted} /><Text style={styles.emptyTitle}>Нет доступа к настройкам</Text><Text style={styles.emptyText}>Управлять группой могут только администраторы.</Text></View>
      </View>
    );
  }

  const memberPermissions = { ...DEFAULT_GROUP_MEMBER_PERMISSIONS, ...settings.member_permissions };
  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
        {mode === 'member-permissions' ? (
          <>
            <Text style={styles.sectionHint}>Выберите, что смогут делать обычные участники группы.</Text>
            <View style={styles.group}>
              {MEMBER_PERMISSION_ROWS.map((row, index) => (
                <SettingSwitchRow key={row.key} title={row.title} subtitle={row.subtitle} value={memberPermissions[row.key]} loading={savingKey === `permission-${row.key}`} isLast={index === MEMBER_PERMISSION_ROWS.length - 1} onValueChange={() => togglePermission(row.key)} styles={styles} accent={colors.accent} />
              ))}
            </View>
          </>
        ) : mode === 'admins' ? (
          <>
            <Text style={styles.sectionHint}>Права каждого администратора можно настроить отдельно.</Text>
            <View style={styles.group}>
              {administrators.map((member, index) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  subtitle={member.role === 'owner' ? 'Владелец группы' : 'Администратор'}
                  isLast={index === administrators.length - 1}
                  onPress={() => {
                    if (member.role === 'owner') return;
                    setSelectedAdmin(member);
                    setMode('admin-permissions');
                  }}
                  styles={styles}
                />
              ))}
            </View>
          </>
        ) : mode === 'members' ? (
          <>
            <Text style={styles.sectionHint}>{canManageAdmins ? 'Нажмите на участника, чтобы назначить его администратором.' : 'Список участников группы.'}</Text>
            <View style={styles.group}>
              {members.map((member, index) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  subtitle={member.role === 'owner' ? 'Владелец' : member.role === 'admin' ? 'Администратор' : 'Участник'}
                  isLast={index === members.length - 1}
                  disabled={member.role !== 'member' || !canManageAdmins}
                  onPress={() => promoteMember(member)}
                  styles={styles}
                />
              ))}
            </View>
          </>
        ) : mode === 'admin-permissions' && selectedAdmin ? (
          <>
            <Text style={styles.sectionHint}>Настройте действия, доступные {memberName(selectedAdmin)}.</Text>
            <View style={styles.group}>
              {ADMIN_PERMISSION_ROWS.map((row, index) => (
                <SettingSwitchRow
                  key={row.key}
                  title={row.title}
                  subtitle={row.subtitle}
                  value={adminPermissions[row.key]}
                  loading={savingKey === `admin-${selectedAdmin.user_id}`}
                  isLast={index === ADMIN_PERMISSION_ROWS.length - 1}
                  onValueChange={() => toggleAdminPermission(row.key)}
                  styles={styles}
                  accent={colors.accent}
                />
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [styles.dangerButton, pressed && styles.actionButtonPressed]}
              onPress={() => Alert.alert('Снять права администратора?', `${memberName(selectedAdmin)} останется участником группы.`, [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Снять права', style: 'destructive', onPress: async () => {
                  await saveAdmin(selectedAdmin, { role: 'member' });
                  setMode('admins');
                } },
              ])}
            >
              <Text style={styles.dangerButtonText}>Снять права администратора</Text>
            </Pressable>
          </>
        ) : (
          <>
            {canManageInvite ? (
              <>
                <Text style={styles.sectionTitle}>ПРИГЛАСИТЕЛЬНАЯ ССЫЛКА</Text>
                <View style={styles.group}>
                  <View style={styles.inviteRow}><Feather name="link" size={21} color={colors.accent} /><View style={styles.inviteText}><Text style={styles.rowTitle}>Ссылка для вступления</Text><Text numberOfLines={1} style={styles.rowSubtitle}>{displayedInvite || 'Ссылка не создана'}</Text></View></View>
                  <View style={styles.inviteActions}><ActionButton label="Копировать" disabled={!displayedInvite} onPress={copyInvite} styles={styles} /><ActionButton label="Отозвать" disabled={!displayedInvite || savingKey === 'invite'} onPress={revokeInvite} styles={styles} /><ActionButton label="Новая ссылка" disabled={savingKey === 'invite'} onPress={regenerateInvite} styles={styles} /></View>
                </View>
              </>
            ) : null}

            <Text style={styles.sectionTitle}>УЧАСТНИКИ</Text>
            <View style={styles.group}>
              <Pressable style={styles.navRow} onPress={() => setMode('member-permissions')}><View style={styles.rowIcon}><Feather name="sliders" size={20} color={colors.accent} /></View><View style={styles.rowText}><Text style={styles.rowTitle}>Права участников</Text><Text style={styles.rowSubtitle}>Что могут делать обычные участники</Text></View><Feather name="chevron-right" size={21} color={colors.iconMuted} /></Pressable>
              <Pressable style={[styles.navRow, styles.rowDivider]} onPress={() => setMode('admins')}><View style={styles.rowIcon}><Feather name="shield" size={20} color={colors.accent} /></View><View style={styles.rowText}><Text style={styles.rowTitle}>Администраторы</Text><Text style={styles.rowSubtitle}>{administrators.length} в группе</Text></View><Feather name="chevron-right" size={21} color={colors.iconMuted} /></Pressable>
              <Pressable style={styles.navRow} onPress={() => setMode('members')}><View style={styles.rowIcon}><Feather name="users" size={20} color={colors.accent} /></View><View style={styles.rowText}><Text style={styles.rowTitle}>Участники</Text><Text style={styles.rowSubtitle}>{members.length} в группе</Text></View><Feather name="chevron-right" size={21} color={colors.iconMuted} /></Pressable>
            </View>

            <Text style={styles.sectionTitle}>ДОПОЛНИТЕЛЬНО</Text>
            <View style={styles.group}>
              <SettingSwitchRow title="Скрывать участников" subtitle="Список участников виден только администраторам" value={settings.hide_members} loading={savingKey === 'hide_members'} onValueChange={() => toggleRoot('hide_members')} styles={styles} accent={colors.accent} />
              <SettingSwitchRow title="Запретить сохранение контента" subtitle="Нельзя пересылать и скачивать медиа" value={settings.restrict_saving_content} loading={savingKey === 'restrict_saving_content'} isLast onValueChange={() => toggleRoot('restrict_saving_content')} styles={styles} accent={colors.accent} />
            </View>
            {isOwner ? (
              <>
                <Text style={styles.sectionTitle}>ОПАСНАЯ ЗОНА</Text>
                <Pressable style={({ pressed }) => [styles.dangerButton, pressed && styles.actionButtonPressed]} onPress={deleteGroup}>
                  <Text style={styles.dangerButtonText}>Удалить группу</Text>
                </Pressable>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SettingSwitchRow({ title, subtitle, value, loading, isLast = false, onValueChange, styles, accent }: { title: string; subtitle: string; value: boolean; loading: boolean; isLast?: boolean; onValueChange: () => void; styles: ReturnType<typeof createStyles>; accent: string }) {
  return <View style={[styles.switchRow, !isLast && styles.rowDivider]}><View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>{loading ? <ActivityIndicator size="small" color={accent} /> : <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#C8CBD0', true: accent }} thumbColor="#FFFFFF" />}</View>;
}

function memberName(member: GroupMember): string {
  return member.user?.display_name?.trim() || member.user?.username?.trim() || member.user?.handle?.trim() || 'Участник';
}

function headerTitle(mode: ViewMode, selectedAdmin: GroupMember | null): string {
  if (mode === 'member-permissions') return 'Права участников';
  if (mode === 'admins') return 'Администраторы';
  if (mode === 'members') return 'Участники';
  if (mode === 'admin-permissions') return memberName(selectedAdmin ?? { user_id: '' });
  return 'Управление группой';
}

function MemberRow({ member, subtitle, isLast, disabled, onPress, styles }: { member: GroupMember; subtitle: string; isLast: boolean; disabled?: boolean; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  const name = memberName(member);
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.memberRow, !isLast && styles.rowDivider, disabled && styles.memberRowDisabled, pressed && !disabled && styles.memberRowPressed]}>
      <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{(name[0] || '?').toUpperCase()}</Text></View>
      <View style={styles.rowText}><Text style={styles.rowTitle} numberOfLines={1}>{name}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
      {!disabled ? <Feather name="chevron-right" size={21} color="#9EA7B3" /> : null}
    </Pressable>
  );
}

function ActionButton({ label, disabled, onPress, styles }: { label: string; disabled?: boolean; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, disabled && styles.actionButtonDisabled, pressed && !disabled && styles.actionButtonPressed]}><Text style={styles.actionButtonText}>{label}</Text></Pressable>;
}

function createStyles(c: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.chatBackground },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chatBackground },
    header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, color: c.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    headerSide: { width: 44 },
    content: { padding: 16 },
    sectionTitle: { color: c.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.55, marginTop: 20, marginBottom: 8 },
    sectionHint: { color: c.textSecondary, fontSize: 14, lineHeight: 19, marginBottom: 14 },
    group: { backgroundColor: c.inputBackgroundSolid, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.composerBorder },
    navRow: { minHeight: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowIcon: { width: 28, alignItems: 'center' },
    rowText: { flex: 1, paddingVertical: 13 },
    rowTitle: { color: c.textPrimary, fontSize: 16, lineHeight: 20, fontWeight: '700' },
    rowSubtitle: { color: c.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
    switchRow: { minHeight: 74, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    inviteRow: { minHeight: 70, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    inviteText: { flex: 1 },
    inviteActions: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    actionButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent + '18' },
    actionButtonPressed: { opacity: 0.72 },
    actionButtonDisabled: { opacity: 0.42 },
    actionButtonText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    memberRow: { minHeight: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    memberRowPressed: { backgroundColor: c.rowPressed },
    memberRowDisabled: { opacity: 0.68 },
    memberAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent },
    memberAvatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    dangerButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 14, backgroundColor: 'rgba(208,72,87,0.12)' },
    dangerButtonText: { color: '#D04857', fontSize: 15, fontWeight: '800' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 42, gap: 10 },
    emptyTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
    emptyText: { color: c.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  });
}

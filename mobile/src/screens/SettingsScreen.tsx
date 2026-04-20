import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow } from '../services/AuthService';
import { getProfile, updateProfile } from '../services/profileService';
import { apiUpload } from '../services/apiClient';
import { resolveAvatarUrl } from '../config';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SettingsIconRow } from '../components/settings/SettingsIconRow';
import { TELEGRAM_SETTINGS_ROW_GLYPHS } from '../icons/telegram/settingsPaths';
import { colors, withAlpha } from '../theme/colors';

const HANDLE_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [profile, setProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    handle: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [savingHandle, setSavingHandle] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getProfile();
      setProfile({
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        handle: p.handle,
      });
      setDisplayName(p.display_name ?? '');
      setHandle(p.handle ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const syncAuthStore = useCallback((apiUser: Parameters<typeof apiUserToUserRow>[0]) => {
    const token = authStore.getState().accessToken;
    if (token) {
      authStore.getState().setSession(apiUserToUserRow(apiUser), token);
    }
  }, []);

  const handleAvatarTap = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos to change avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      const asset = result.assets[0];
      const uploadRes = await apiUpload({
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      const avatarUrl = typeof uploadRes.url === 'string' ? uploadRes.url : (uploadRes as { url: string }).url;
      const updated = await updateProfile({ avatar_url: avatarUrl });
      setProfile((prev) => (prev ? { ...prev, avatar_url: updated.avatar_url } : null));
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }, [syncAuthStore]);

  const handleSaveDisplayName = useCallback(async () => {
    const trimmed = displayName.trim();
    if (trimmed === (profile?.display_name ?? '')) return;
    setSavingDisplayName(true);
    setError(null);
    try {
      const updated = await updateProfile({ display_name: trimmed || undefined });
      setProfile((prev) => (prev ? { ...prev, display_name: updated.display_name } : null));
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save display name');
    } finally {
      setSavingDisplayName(false);
    }
  }, [displayName, profile?.display_name, syncAuthStore]);

  const handleSaveHandle = useCallback(async () => {
    const trimmed = handle.trim().replace(/^@/, '');
    if (trimmed === (profile?.handle ?? '')) return;
    if (trimmed.length > 0) {
      if (trimmed.length < 5 || trimmed.length > 32) {
        setError('Handle must be 5-32 characters');
        return;
      }
      if (!HANDLE_REGEX.test(trimmed)) {
        setError('Handle can only contain letters, numbers, and underscores (no @, -, or spaces)');
        return;
      }
    }
    setSavingHandle(true);
    setError(null);
    try {
      const updated = await updateProfile({ handle: trimmed || undefined });
      setProfile((prev) => (prev ? { ...prev, handle: updated.handle } : null));
      setHandle(updated.handle ?? '');
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save handle');
    } finally {
      setSavingHandle(false);
    }
  }, [handle, profile?.handle, syncAuthStore]);

  const handleValue = (profile?.handle ?? handle).trim().replace(/^@/, '');
  const handleCopyHandle = useCallback(async () => {
    if (!handleValue) {
      Alert.alert('No handle to copy', 'Set a handle first, then copy it.');
      return;
    }
    const toCopy = `@${handleValue}`;
    await Clipboard.setStringAsync(toCopy);
    Alert.alert('Copied', `${toCopy} copied to clipboard`);
  }, [handleValue]);

  const avatarUrl = resolveAvatarUrl(profile?.avatar_url ?? user?.avatar_url);
  const profileTitle = profile?.display_name?.trim() || user?.display_name?.trim() || 'Ваш профиль';
  const profileHandleLabel = handleValue ? `@${handleValue}` : 'Нажмите на фото, чтобы изменить аватар';

  const showComingSoon = useCallback((title: string) => {
    Alert.alert('Скоро', `${title}: раздел будет подключен позже.`);
  }, []);

  const sg = TELEGRAM_SETTINGS_ROW_GLYPHS;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Аккаунт</Text>
        <View style={styles.profileCard}>
          <Pressable
            style={styles.profileHeader}
            onPress={uploadingAvatar ? undefined : handleAvatarTap}
            disabled={uploadingAvatar}
          >
            <View style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {(profile?.display_name ?? user?.display_name ?? '?')[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.profileSummary}>
              <Text style={styles.profileTitle}>{profileTitle}</Text>
              <Text style={styles.profileSubtitle}>{profileHandleLabel}</Text>
              <Text style={styles.profileHint}>Нажмите, чтобы изменить фото профиля</Text>
            </View>
          </Pressable>

          <View style={styles.formCard}>
            <View style={styles.field}>
              <Text style={styles.label}>Display name</Text>
              <View style={styles.row}>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
                <Pressable
                  style={[styles.saveBtn, savingDisplayName && styles.saveBtnDisabled]}
                  onPress={handleSaveDisplayName}
                  disabled={savingDisplayName}
                >
                  {savingDisplayName ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldLast}>
              <Text style={styles.label}>Handle</Text>
              <View style={styles.row}>
                <Text style={styles.handlePrefix}>@</Text>
                <TextInput
                  style={[styles.input, styles.handleInput]}
                  value={handle.replace(/^@/, '')}
                  onChangeText={(t) => setHandle(t.replace(/^@/, ''))}
                  placeholder="handle"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.saveBtn, savingHandle && styles.saveBtnDisabled]}
                  onPress={handleSaveHandle}
                  disabled={savingHandle}
                >
                  {savingHandle ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </Pressable>
              </View>
              <Pressable
                style={[styles.copyBtn, !handleValue && styles.copyBtnDisabled]}
                onPress={handleCopyHandle}
                disabled={!handleValue}
              >
                <Text style={[styles.copyBtnText, !handleValue && styles.copyBtnTextDisabled]}>
                  Copy handle
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Настройки</Text>
        <View style={styles.settingsCard}>
          <SettingsIconRow
            title="Уведомления и звуки"
            iconD={sg.sounds.d}
            iconFillRule={sg.sounds.fillRule}
            placeholder
            onPress={() => showComingSoon('Уведомления и звуки')}
          />
          <SettingsIconRow
            title="Конфиденциальность"
            iconD={sg.privacy.d}
            iconFillRule={sg.privacy.fillRule}
            placeholder
            onPress={() => showComingSoon('Конфиденциальность')}
          />
          <SettingsIconRow
            title="Данные и память"
            iconD={sg.data.d}
            iconFillRule={sg.data.fillRule}
            placeholder
            onPress={() => showComingSoon('Данные и память')}
          />
          <SettingsIconRow
            title="Настройки чатов"
            iconD={sg.chat.d}
            iconFillRule={sg.chat.fillRule}
            placeholder
            onPress={() => showComingSoon('Настройки чатов')}
          />
          <SettingsIconRow
            title="Язык"
            iconD={sg.language.d}
            iconFillRule={sg.language.fillRule}
            placeholder
            onPress={() => showComingSoon('Язык')}
          />
          <SettingsIconRow
            title="Устройства"
            iconD={sg.devices.d}
            iconFillRule={sg.devices.fillRule}
            placeholder
            onPress={() => showComingSoon('Устройства')}
          />
          <SettingsIconRow
            title="Пароль и безопасность"
            iconD={sg.security.d}
            iconFillRule={sg.security.fillRule}
            placeholder
            onPress={() => showComingSoon('Пароль и безопасность')}
          />
        </View>

        <Text style={styles.sectionTitle}>Сервисы</Text>
        <View style={styles.settingsCard}>
          <Pressable
            onPress={() => navigation.navigate('Services' as never)}
            style={({ pressed }) => [styles.servicesRow, pressed && styles.servicesRowPressed]}
          >
            <View style={styles.servicesIconBubble}>
              <MaterialCommunityIcons
                name="apps"
                size={22}
                color={colors.accent}
              />
            </View>
            <View style={styles.servicesText}>
              <Text style={styles.servicesTitle}>Сервисы</Text>
              <Text style={styles.servicesSubtitle}>
                Мини-приложения и ChatusFather
              </Text>
            </View>
            <Text style={styles.servicesChevron}>›</Text>
          </Pressable>
        </View>

        <View style={[styles.settingsCard, styles.logoutCard]}>
          <SettingsIconRow
            title="Выйти из аккаунта"
            iconD={sg.power.d}
            iconFillRule={sg.power.fillRule}
            iconColor="#E53935"
            destructive
            placeholder={false}
            showChevron={false}
            onPress={logout}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.chatBackground },
  scroll: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
  },
  settingsCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  profileCard: {
    marginBottom: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    marginBottom: 12,
  },
  profileSummary: {
    flex: 1,
    minWidth: 0,
    marginLeft: 16,
  },
  profileTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  profileSubtitle: {
    marginTop: 4,
    fontSize: 15,
    color: colors.accent,
  },
  profileHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
  },
  formCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  logoutCard: {
    marginTop: 16,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: '#c62828', fontSize: 14 },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#9e9e9e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '600',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  field: { marginBottom: 20 },
  fieldLast: { marginBottom: 0 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackgroundSolid,
  },
  handleInput: { flex: 1 },
  handlePrefix: { fontSize: 16, color: colors.textPrimary },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  copyBtn: {
    marginTop: 8,
    paddingVertical: 8,
  },
  copyBtnDisabled: { opacity: 0.5 },
  copyBtnText: { color: colors.accent, fontSize: 14 },
  copyBtnTextDisabled: { color: colors.placeholder },
  buttonPressed: { opacity: 0.8 },
  servicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 52,
    backgroundColor: colors.inputBackgroundSolid,
  },
  servicesRowPressed: {
    backgroundColor: colors.inputBackground,
  },
  servicesIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(colors.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  servicesText: { flex: 1, minWidth: 0 },
  servicesTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  servicesSubtitle: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  servicesChevron: {
    fontSize: 22,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '300',
  },
});

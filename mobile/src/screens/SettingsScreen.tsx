import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../contexts/AuthContext';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow } from '../services/AuthService';
import { getProfile, updateProfile } from '../services/profileService';
import { apiUpload } from '../services/apiClient';
import { resolveAvatarUrl } from '../config';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AvatarPickSheet, type AvatarPickResult } from '../components/AvatarPickSheet';
import { SettingsIconRow } from '../components/settings/SettingsIconRow';
import { TELEGRAM_SETTINGS_ROW_GLYPHS } from '../icons/telegram/settingsPaths';
import { useTheme } from '../contexts/ThemeContext';
import { createSettingsScreenStyles } from './settingsScreen.styles';

const HANDLE_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

export function SettingsScreen() {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createSettingsScreenStyles(themeColors), [themeColors]);
  const { user, logout } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
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
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);

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

  const handleAvatarTap = useCallback(() => {
    setAvatarSheetVisible(true);
  }, []);

  const handleAvatarPicked = useCallback(
    async (pick: AvatarPickResult) => {
      setUploadingAvatar(true);
      setError(null);
      try {
        const uploadRes = await apiUpload({
          uri: pick.uri,
          name: pick.name,
          type: pick.type,
        });
        const avatarUrlRaw = typeof uploadRes.url === 'string' ? uploadRes.url : (uploadRes as { url: string }).url;
        const updated = await updateProfile({ avatar_url: avatarUrlRaw });
        setProfile((prev) => (prev ? { ...prev, avatar_url: updated.avatar_url } : null));
        await authService.saveUserToLocal(updated);
        syncAuthStore(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to upload avatar');
      } finally {
        setUploadingAvatar(false);
      }
    },
    [syncAuthStore],
  );

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
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <>
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
                  placeholderTextColor={themeColors.placeholder}
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
                  placeholderTextColor={themeColors.placeholder}
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
          <Pressable
            onPress={() => navigation.navigate('Appearance')}
            style={({ pressed }) => [
              styles.servicesRow,
              pressed && styles.servicesRowPressed,
            ]}
          >
            <View style={styles.servicesIconBubble}>
              <MaterialCommunityIcons
                name="palette-outline"
                size={22}
                color={themeColors.accent}
              />
            </View>
            <View style={styles.servicesText}>
              <Text style={styles.servicesTitle}>Оформление</Text>
              <Text style={styles.servicesSubtitle}>Тема приложения</Text>
            </View>
            <Text style={styles.servicesChevron}>›</Text>
          </Pressable>
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
            onPress={() => navigation.navigate('Services')}
            style={({ pressed }) => [styles.servicesRow, pressed && styles.servicesRowPressed]}
          >
            <View style={styles.servicesIconBubble}>
              <MaterialCommunityIcons
                name="apps"
                size={22}
                color={themeColors.accent}
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

        <Text style={styles.sectionTitle}>Обратная связь</Text>
        <View style={styles.settingsCard}>
          <Pressable
            onPress={() => navigation.navigate('FeedbackList', { kind: 'bug' })}
            style={({ pressed }) => [styles.servicesRow, pressed && styles.servicesRowPressed]}
          >
            <View style={styles.servicesIconBubble}>
              <MaterialCommunityIcons name="bug-outline" size={22} color={themeColors.accent} />
            </View>
            <View style={styles.servicesText}>
              <Text style={styles.servicesTitle}>Сообщить о баге</Text>
              <Text style={styles.servicesSubtitle}>Список ваших сообщений и новая заявка</Text>
            </View>
            <Text style={styles.servicesChevron}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('FeedbackList', { kind: 'suggestion' })}
            style={({ pressed }) => [
              styles.servicesRow,
              styles.feedbackRowSecond,
              pressed && styles.servicesRowPressed,
            ]}
          >
            <View style={styles.servicesIconBubble}>
              <MaterialCommunityIcons name="lightbulb-outline" size={22} color={themeColors.accent} />
            </View>
            <View style={styles.servicesText}>
              <Text style={styles.servicesTitle}>Предложения</Text>
              <Text style={styles.servicesSubtitle}>Идеи по улучшению приложения</Text>
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
      <AvatarPickSheet
        visible={avatarSheetVisible}
        onClose={() => setAvatarSheetVisible(false)}
        onPick={(pick) => void handleAvatarPicked(pick)}
        subtitle="Фото профиля"
      />
    </>
    );
  }

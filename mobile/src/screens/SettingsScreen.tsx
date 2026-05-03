import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow } from '../services/AuthService';
import { getProfile, updateProfile } from '../services/profileService';
import { apiUpload } from '../services/apiClient';
import { resolveAvatarUrl } from '../config';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AvatarPickSheet, type AvatarPickResult } from '../components/AvatarPickSheet';
import { SettingsIconRow } from '../components/settings/SettingsIconRow';
import { TELEGRAM_SETTINGS_ROW_GLYPHS } from '../icons/telegram/settingsPaths';
import { useTheme } from '../contexts/ThemeContext';
import { createSettingsScreenStyles } from './settingsScreen.styles';
import { telegramAccountStore } from '../stores/telegramAccountStore';

export function SettingsScreen() {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createSettingsScreenStyles(themeColors), [themeColors]);
  const { user, logout } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [profile, setProfile] = useState<{
    display_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    handle: string | null;
    phone: string | null;
    bio: string | null;
    birthday: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const telegramAuthStatus = telegramAccountStore((s) => s.authStatus);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getProfile();
      setProfile({
        display_name: p.display_name,
        last_name: p.last_name ?? null,
        avatar_url: p.avatar_url,
        handle: p.handle,
        phone: p.phone,
        bio: p.bio ?? null,
        birthday: p.birthday ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('EditProfile')}
          style={({ pressed }) => ({
            marginRight: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 14,
            backgroundColor: themeColors.inputBackgroundSolid,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.textPrimary }}>
            Изм.
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, themeColors.inputBackgroundSolid, themeColors.textPrimary]);

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

  const avatarUrl = resolveAvatarUrl(profile?.avatar_url ?? user?.avatar_url);
  const profileTitle =
    [profile?.display_name?.trim(), profile?.last_name?.trim()].filter(Boolean).join(' ') ||
    profile?.display_name?.trim() ||
    user?.display_name?.trim() ||
    'Ваш профиль';
  const handleVal = profile?.handle?.trim().replace(/^@/, '') ?? '';
  const phoneLine = profile?.phone?.trim() || '';
  const handleLine = handleVal ? `@${handleVal}` : '';

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
        <Text
          style={{
            fontSize: 12,
            color: themeColors.textSecondaryMuted,
            marginBottom: 8,
            marginTop: -4,
          }}
        >
          Удерживайте карточку профиля, чтобы добавить Telegram или выйти из Chatus (Loginus).
        </Text>
        <Pressable
          style={styles.profileHeroCard}
          delayLongPress={450}
          onLongPress={() => {
            Alert.alert(
              'Аккаунты',
              'Telegram (TDLib) и Chatus (Loginus) — разные сессии.',
              [
                {
                  text: 'Подключить / сменить Telegram',
                  onPress: () => navigation.navigate('TelegramAuth'),
                },
                {
                  text: 'Выйти из Chatus (Loginus)…',
                  style: 'destructive',
                  onPress: () => {
                    Alert.alert(
                      'Выйти из Chatus?',
                      'Сессия Loginus будет сброшена. Подключённый Telegram на устройстве не удаляем.',
                      [
                        { text: 'Отмена', style: 'cancel' },
                        { text: 'Выйти', style: 'destructive', onPress: () => void logout() },
                      ],
                    );
                  },
                },
                { text: 'Отмена', style: 'cancel' },
              ],
            );
          }}
          onPress={() => navigation.navigate('MyProfile')}
        >
          <View style={styles.profileHeroAvatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.profileHeroAvatar} />
            ) : (
              <View style={styles.profileHeroAvatarPlaceholder}>
                <Text style={styles.profileHeroAvatarText}>
                  {(profile?.display_name ?? user?.display_name ?? '?')[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.profileHeroAvatarOverlay}>
                <ActivityIndicator color={themeColors.textSecondaryMuted} />
              </View>
            )}
          </View>
          <Text style={styles.profileHeroTitle}>{profileTitle}</Text>
          <Text style={styles.profileHeroMeta} numberOfLines={2}>
            {phoneLine && handleLine
              ? `${phoneLine} · ${handleLine}`
              : phoneLine || handleLine || ' '}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.changePhotoBtn,
            pressed && { opacity: 0.85 },
            uploadingAvatar && { opacity: 0.5 },
          ]}
          onPress={uploadingAvatar ? undefined : handleAvatarTap}
          disabled={uploadingAvatar}
        >
          <MaterialCommunityIcons name="camera-plus-outline" size={22} color={themeColors.accent} />
          <Text style={styles.changePhotoBtnText}>Изменить фотографию</Text>
        </Pressable>

        <View style={{ height: 8 }} />

        <Text style={styles.sectionTitle}>Настройки</Text>
        <View style={styles.settingsCard}>
          <Pressable
            onPress={() =>
              telegramAuthStatus === 'ready'
                ? navigation.navigate('TelegramDialogs')
                : navigation.navigate('TelegramAuth')
            }
            style={({ pressed }) => [
              styles.servicesRow,
              pressed && styles.servicesRowPressed,
            ]}
          >
            <View style={styles.servicesIconBubble}>
              <MaterialCommunityIcons name="send-circle-outline" size={22} color={themeColors.accent} />
            </View>
            <View style={styles.servicesText}>
              <Text style={styles.servicesTitle}>Telegram</Text>
              <Text style={styles.servicesSubtitle}>
                {telegramAuthStatus === 'ready' ? 'Открыть диалоги' : 'Подключить аккаунт (TDLib на устройстве)'}
              </Text>
            </View>
            <Text style={styles.servicesChevron}>›</Text>
          </Pressable>
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

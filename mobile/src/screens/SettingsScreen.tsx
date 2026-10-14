import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../contexts/AuthContext';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow } from '../services/AuthService';
import { getProfile, updateProfile } from '../services/profileService';
import { apiUpload } from '../services/apiClient';
import { resolveAvatarUrl } from '../config';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { AvatarPickSheet, type AvatarPickResult } from '../components/AvatarPickSheet';
import { useTheme } from '../contexts/ThemeContext';
import { createSettingsScreenStyles } from './settingsScreen.styles';
import { getSettingsPalette } from './settingsPalette';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { getTelegramSettingsConnectionMeta } from './telegramAuth/telegramAuthPresentation';
import { friendlyApiError } from '../utils/apiErrorMessage';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Не перезапрашивать профиль чаще, чем раз в это время, если прошлая загрузка удалась. */
const PROFILE_REFRESH_MIN_INTERVAL_MS = 30_000;

export function SettingsScreen() {
  const { colors: themeColors, resolvedScheme } = useTheme();
  const palette = useMemo(() => getSettingsPalette(resolvedScheme), [resolvedScheme]);
  const styles = useMemo(() => createSettingsScreenStyles(themeColors, palette), [themeColors, palette]);
  const insets = useSafeAreaInsets();
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
  } | null>(() =>
    // Профиль из локальной сессии: экран рисуется сразу, а свежие данные подтягиваются в фоне
    user
      ? {
          display_name: user.display_name ?? null,
          last_name: user.last_name ?? null,
          avatar_url: user.avatar_url ?? null,
          handle: user.handle ?? null,
          phone: user.phone ?? null,
          bio: user.bio ?? null,
          birthday: user.birthday ?? null,
        }
      : null,
  );
  // Спиннер на весь экран — только если показать совсем нечего (раньше экран висел пустым, пока шёл запрос)
  const [loading, setLoading] = useState(() => !user);
  const [error, setError] = useState<string | null>(null);
  const lastLoadedAtRef = useRef(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const telegramAuthStatus = telegramAccountStore((s) => s.authStatus);
  const telegramConnectionMeta = useMemo(
    () => getTelegramSettingsConnectionMeta(telegramAuthStatus),
    [telegramAuthStatus],
  );

  const openTelegram = useCallback(() => {
    if (telegramAuthStatus !== 'ready') {
      navigation.navigate('TelegramAuth');
      return;
    }
    Alert.alert('Выйти из Telegram?', 'Диалоги Telegram исчезнут из общего списка чатов на этом устройстве.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => {
          void telegramAccountStore.getState().resetTelegramSession();
        },
      },
    ]);
  }, [navigation, telegramAuthStatus]);

  const loadProfile = useCallback(async () => {
    setError(null);
    try {
      const p = await getProfile();
      lastLoadedAtRef.current = Date.now();
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
      lastLoadedAtRef.current = 0; // после ошибки следующий вход на экран пробует снова
      setError(friendlyApiError(e, 'Не удалось загрузить профиль'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAtRef.current < PROFILE_REFRESH_MIN_INTERVAL_MS) return;
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
            backgroundColor: palette.card,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: palette.title }}>
            Изм.
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, palette.card, palette.title]);

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
        setError(friendlyApiError(e, 'Не удалось загрузить фото'));
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
  const initial = (profile?.display_name ?? user?.display_name ?? '')[0]?.toUpperCase() ?? '';

  const showComingSoon = useCallback((title: string) => {
    Alert.alert('Скоро', `${title}: раздел будет подключен позже.`);
  }, []);

  const telegramBadgeColors = useMemo(() => {
    if (resolvedScheme !== 'dark') {
      return { bg: telegramConnectionMeta.badgeBg, text: telegramConnectionMeta.badgeText };
    }
    // на тёмном фоне тёмно-зелёный/синий текст бейджа почти не виден — осветляем
    const lighter: Record<string, string> = {
      '#2E7D4A': '#5FD38A',
      '#B45309': '#FBBF24',
      '#2563EB': '#7FB2FF',
      '#C62828': '#FF8A8F',
    };
    return {
      bg: telegramConnectionMeta.badgeBg,
      text: lighter[telegramConnectionMeta.badgeText] ?? telegramConnectionMeta.badgeText,
    };
  }, [resolvedScheme, telegramConnectionMeta]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.link} />
      </View>
    );
  }

  const renderRow = (row: {
    key: string;
    icon: IconName;
    title: string;
    subtitle?: string;
    onPress: () => void;
    soon?: boolean;
    last?: boolean;
    badge?: { label: string; bg: string; text: string };
    testID?: string;
  }) => (
    <Pressable
      key={row.key}
      testID={row.testID}
      onPress={row.onPress}
      style={({ pressed }) => [
        styles.row,
        !row.last && styles.rowDivider,
        row.soon && styles.rowSoon,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.tile}>
        <MaterialCommunityIcons name={row.icon} size={20} color={palette.tileIcon} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {row.title}
        </Text>
        {row.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {row.subtitle}
          </Text>
        ) : null}
      </View>
      {row.badge ? (
        <View style={[styles.statusBadge, { backgroundColor: row.badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: row.badge.text }]}>{row.badge.label}</Text>
        </View>
      ) : null}
      {row.soon ? (
        <Text style={styles.soonLabel}>Скоро</Text>
      ) : (
        <View style={styles.chevronWrap}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={palette.chevron} />
        </View>
      )}
    </Pressable>
  );

  const soon = (title: string) => () => showComingSoon(title);

  return (
    <>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.heroCard}>
            <Pressable
              style={styles.heroAvatarWrap}
              onPress={() => navigation.navigate('MyProfile')}
              testID="settings-hero-avatar"
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.heroAvatar}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <LinearGradient
                  colors={[palette.gradientFrom, palette.gradientTo]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroAvatar}
                >
                  {initial ? (
                    <Text style={styles.heroAvatarInitial}>{initial}</Text>
                  ) : (
                    <MaterialCommunityIcons name="account-outline" size={42} color="#FFFFFF" />
                  )}
                </LinearGradient>
              )}
              {uploadingAvatar && (
                <View style={styles.heroAvatarOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              )}
              <Pressable
                style={styles.heroCameraBadge}
                onPress={uploadingAvatar ? undefined : handleAvatarTap}
                disabled={uploadingAvatar}
                hitSlop={8}
                testID="settings-hero-camera"
              >
                <MaterialCommunityIcons name="camera" size={13} color="#FFFFFF" />
              </Pressable>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('MyProfile')}>
              <Text style={styles.heroTitle}>{profileTitle}</Text>
              <Text style={styles.heroMeta} numberOfLines={2}>
                {phoneLine && handleLine
                  ? `${phoneLine} · ${handleLine}`
                  : phoneLine || handleLine || ' '}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.heroChangePhoto, pressed && { opacity: 0.7 }, uploadingAvatar && { opacity: 0.5 }]}
              onPress={uploadingAvatar ? undefined : handleAvatarTap}
              disabled={uploadingAvatar}
            >
              <Text style={styles.heroChangePhotoText}>Изменить фотографию</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Подключения</Text>
          <View style={styles.card}>
            {renderRow({
              key: 'telegram',
              icon: 'send-outline',
              title: 'Telegram',
              subtitle: telegramConnectionMeta.subtitle,
              onPress: openTelegram,
              badge: {
                label: telegramConnectionMeta.badge,
                bg: telegramBadgeColors.bg,
                text: telegramBadgeColors.text,
              },
            })}
            {renderRow({
              key: 'services',
              icon: 'view-grid-outline',
              title: 'Сервисы',
              subtitle: 'Мини-приложения и боты',
              onPress: () => navigation.navigate('Services'),
              last: true,
            })}
          </View>

          <Text style={styles.sectionTitle}>Приложение</Text>
          <View style={styles.card}>
            {renderRow({
              key: 'appearance',
              icon: 'palette-outline',
              title: 'Оформление',
              subtitle: 'Тема приложения',
              onPress: () => navigation.navigate('Appearance'),
            })}
            {renderRow({
              key: 'chats',
              icon: 'message-outline',
              title: 'Настройки чатов',
              onPress: () => navigation.navigate('ChatSettings'),
            })}
            {renderRow({
              key: 'notifications',
              icon: 'bell-outline',
              title: 'Уведомления и звуки',
              onPress: soon('Уведомления и звуки'),
              soon: true,
            })}
            {renderRow({
              key: 'language',
              icon: 'earth',
              title: 'Язык',
              onPress: soon('Язык'),
              soon: true,
            })}
            {renderRow({
              key: 'data',
              icon: 'chart-pie',
              title: 'Данные и память',
              onPress: soon('Данные и память'),
              soon: true,
              last: true,
            })}
          </View>

          <Text style={styles.sectionTitle}>Безопасность</Text>
          <View style={styles.card}>
            {renderRow({
              key: 'privacy',
              icon: 'shield-outline',
              title: 'Конфиденциальность',
              onPress: soon('Конфиденциальность'),
              soon: true,
            })}
            {renderRow({
              key: 'security',
              icon: 'lock-outline',
              title: 'Пароль и безопасность',
              onPress: soon('Пароль и безопасность'),
              soon: true,
            })}
            {renderRow({
              key: 'devices',
              icon: 'laptop',
              title: 'Устройства',
              onPress: soon('Устройства'),
              soon: true,
              last: true,
            })}
          </View>

          <Text style={styles.sectionTitle}>Поддержка</Text>
          <View style={styles.card}>
            {renderRow({
              key: 'bug',
              icon: 'bug-outline',
              title: 'Сообщить о баге',
              subtitle: 'Список ваших сообщений и новая заявка',
              onPress: () => navigation.navigate('FeedbackList', { kind: 'bug' }),
            })}
            {renderRow({
              key: 'suggestion',
              icon: 'lightbulb-outline',
              title: 'Предложения',
              subtitle: 'Идеи по улучшению приложения',
              onPress: () => navigation.navigate('FeedbackList', { kind: 'suggestion' }),
              last: true,
            })}
          </View>

          <View style={[styles.card, styles.logoutCard]}>
            <Pressable
              testID="settings-logout"
              onPress={logout}
              style={({ pressed }) => [styles.row, styles.logoutRow, pressed && styles.rowPressed]}
            >
              <MaterialCommunityIcons name="logout" size={20} color={palette.danger} style={{ marginRight: 10 }} />
              <Text style={[styles.rowTitle, styles.rowTitleDanger]}>Выйти из аккаунта</Text>
            </Pressable>
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

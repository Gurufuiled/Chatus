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
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SettingsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow } from '../services/AuthService';
import { getProfile, updateProfile } from '../services/profileService';
import { apiUpload } from '../services/apiClient';
import { resolveAvatarUrl } from '../config';
import { AvatarPickSheet, type AvatarPickResult } from '../components/AvatarPickSheet';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { StyleSheet } from 'react-native';

const HANDLE_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'EditProfile'>;

function createEditProfileStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.header },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
    },
    pillText: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignSelf: 'center',
      marginTop: 16,
    },
    avatarPh: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignSelf: 'center',
      marginTop: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPhText: { fontSize: 40, fontWeight: '700', color: c.textSecondaryMuted },
    pickPhoto: {
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 8,
      fontSize: 16,
      fontWeight: '600',
    },
    card: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      overflow: 'hidden',
    },
    inputRow: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.textPrimary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    inputRowLast: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.textPrimary,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    caption: {
      marginHorizontal: 20,
      marginTop: 6,
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowLabel: { fontSize: 16, color: c.textPrimary },
    rowValue: { fontSize: 15, color: c.textSecondary, maxWidth: '55%' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
}

function birthdayToInput(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '';
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function EditProfileScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createEditProfileStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [birthday, setBirthday] = useState('');
  const [handle, setHandle] = useState('');
  const [phone, setPhone] = useState<string | null>(null);

  const syncAuthStore = useCallback((apiUser: Parameters<typeof apiUserToUserRow>[0]) => {
    const token = authStore.getState().accessToken;
    if (token) {
      authStore.getState().setSession(apiUserToUserRow(apiUser), token);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getProfile();
      setDisplayName(p.display_name ?? '');
      setLastName(p.last_name ?? '');
      setBio(p.bio ?? '');
      setBirthday(birthdayToInput(p.birthday));
      setHandle((p.handle ?? '').replace(/^@/, ''));
      setPhone(p.phone ?? null);
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleAvatarPicked = useCallback(
    async (pick: AvatarPickResult) => {
      setUploadingAvatar(true);
      try {
        const uploadRes = await apiUpload({
          uri: pick.uri,
          name: pick.name,
          type: pick.type,
        });
        const avatarUrlRaw =
          typeof uploadRes.url === 'string' ? uploadRes.url : (uploadRes as { url: string }).url;
        const updated = await updateProfile({ avatar_url: avatarUrlRaw });
        await authService.saveUserToLocal(updated);
        syncAuthStore(updated);
        setAvatarSheetVisible(false);
      } catch (e) {
        Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
      } finally {
        setUploadingAvatar(false);
      }
    },
    [syncAuthStore],
  );

  const onDone = useCallback(async () => {
    const trimmedHandle = handle.trim().replace(/^@/, '');
    if (trimmedHandle.length > 0) {
      if (trimmedHandle.length < 5 || trimmedHandle.length > 32 || !HANDLE_REGEX.test(trimmedHandle)) {
        Alert.alert('Имя пользователя', '5–32 символа: буквы, цифры и _.');
        return;
      }
    }
    const bday = birthday.trim();
    if (bday && !/^\d{4}-\d{2}-\d{2}$/.test(bday)) {
      Alert.alert('День рождения', 'Формат ГГГГ-ММ-ДД');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({
        display_name: displayName.trim() || undefined,
        last_name: lastName.trim() || null,
        bio: bio.trim() || null,
        birthday: bday ? bday : null,
        handle: trimmedHandle === '' ? null : trimmedHandle,
      });
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [bio, birthday, displayName, handle, lastName, navigation, syncAuthStore]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const avatarUrl = resolveAvatarUrl(authStore.getState().user?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <Pressable style={styles.pill} onPress={() => navigation.goBack()}>
          <Text style={styles.pillText}>Отмена</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, saving && { opacity: 0.5 }]}
          onPress={() => void onDone()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.pillText}>Готово</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Pressable disabled={uploadingAvatar} onPress={() => setAvatarSheetVisible(true)}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPh, { backgroundColor: colors.accent }]}>
              <Text style={styles.avatarPhText}>{initial}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => setAvatarSheetVisible(true)}>
          <Text style={[styles.pickPhoto, { color: colors.accent }]}>Выбрать фотографию</Text>
        </Pressable>

        <View style={styles.card}>
          <TextInput
            style={styles.inputRow}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Имя"
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            style={styles.inputRowLast}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Фамилия"
            placeholderTextColor={colors.placeholder}
          />
        </View>
        <Text style={styles.caption}>
          Укажите имя и, если хотите, добавьте фотографию для Вашего профиля.
        </Text>

        <View style={[styles.card, { marginTop: 20 }]}>
          <TextInput
            style={[styles.inputRowLast, styles.multiline]}
            value={bio}
            onChangeText={setBio}
            placeholder="О себе"
            placeholderTextColor={colors.placeholder}
            multiline
          />
        </View>
        <Text style={styles.caption}>
          Вы можете добавить несколько строк о себе. В настройках можно выбрать, кому они будут видны.
        </Text>

        <View style={[styles.card, { marginTop: 20 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>День рождения</Text>
            <TextInput
              style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}
              value={birthday}
              onChangeText={setBirthday}
              placeholder="ГГГГ-ММ-ДД"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        </View>
        <Text style={styles.caption}>Ваш день рождения могут видеть только контакты.</Text>

        <View style={[styles.card, { marginTop: 20 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Номер</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {phone ?? '—'}
            </Text>
          </View>
          <View style={[styles.rowBetween, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Имя пользователя</Text>
            <TextInput
              style={[styles.rowValue, { flex: 1, textAlign: 'right', color: colors.textPrimary }]}
              value={handle}
              onChangeText={(t) => setHandle(t.replace(/^@/, ''))}
              placeholder="handle"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </ScrollView>

      <AvatarPickSheet
        visible={avatarSheetVisible}
        onClose={() => setAvatarSheetVisible(false)}
        onPick={(pick) => void handleAvatarPicked(pick)}
        subtitle="Фото профиля"
      />
    </KeyboardAvoidingView>
  );
}

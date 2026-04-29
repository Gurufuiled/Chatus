import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SettingsStackParamList } from '../navigation/types';
import { getProfile } from '../services/profileService';
import { resolveAvatarUrl } from '../config';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { StyleSheet } from 'react-native';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'MyProfile'>;

function fmtBirthday(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—';
  return new Date(ms).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function createMyProfileStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.header },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingBottom: 48 },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignSelf: 'center',
      marginTop: 20,
    },
    avatarPh: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignSelf: 'center',
      marginTop: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPhText: { fontSize: 48, fontWeight: '700', color: c.textSecondaryMuted },
    name: {
      marginTop: 16,
      textAlign: 'center',
      fontSize: 24,
      fontWeight: '700',
      color: c.textPrimary,
      paddingHorizontal: 24,
    },
    card: {
      marginHorizontal: 16,
      marginTop: 24,
      borderRadius: 16,
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      overflow: 'hidden',
    },
    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowLast: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    label: { fontSize: 13, color: c.textSecondary, marginBottom: 4 },
    value: { fontSize: 16, color: c.textPrimary },
    valueAccent: { fontSize: 16, color: c.accent, fontWeight: '600' },
  });
}

export function MyProfileScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createMyProfileStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState<Awaited<ReturnType<typeof getProfile>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setP(await getProfile());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: 'Профиль' });
  }, [navigation]);

  if (loading || !p) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const avatarUrl = resolveAvatarUrl(p.avatar_url);
  const fullName =
    [p.display_name?.trim(), p.last_name?.trim()].filter(Boolean).join(' ') ||
    p.display_name ||
    'Профиль';
  const initial = (fullName.trim()[0] || '?').toUpperCase();
  const handleStr = p.handle?.trim() ? `@${p.handle.trim()}` : '—';

  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top }]}
      contentContainerStyle={styles.scroll}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarPh, { backgroundColor: colors.accent }]}>
          <Text style={styles.avatarPhText}>{initial}</Text>
        </View>
      )}
      <Text style={styles.name}>{fullName}</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>мобильный</Text>
          <Text style={styles.valueAccent}>{p.phone?.trim() || '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>имя пользователя</Text>
          <Text style={styles.valueAccent}>{handleStr}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>день рождения</Text>
          <Text style={styles.value}>{fmtBirthday(p.birthday)}</Text>
        </View>
        <View style={styles.rowLast}>
          <Text style={styles.label}>о себе</Text>
          <Text style={styles.value}>{p.bio?.trim() || '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

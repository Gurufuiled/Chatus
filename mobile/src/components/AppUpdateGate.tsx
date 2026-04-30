import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform, type ViewStyle } from 'react-native';
import * as Linking from 'expo-linking';

import { useTheme } from '../contexts/ThemeContext';
import {
  CLIENT_RELEASE_TAG,
  CLIENT_UPDATE_APK_URL_OVERRIDE,
  CLIENT_UPDATE_CHECK_IN_DEV,
  CLIENT_UPDATE_DISABLED,
  CLIENT_UPDATE_MANIFEST_URL,
} from '../config';
import {
  evaluateAndroidUpdate,
  fetchClientUpdateManifest,
  getCurrentAndroidVersionCode,
} from '../services/clientUpdateService';

type GateMode = 'idle' | 'force' | 'soft';

/**
 * Проверка манифеста обновления при старте (Android). Ошибки сети/JSON не блокируют приложение.
 */
export function AppUpdateGate() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<GateMode>('idle');
  const [apkUrl, setApkUrl] = useState<string | null>(null);

  useEffect(() => {
    if (CLIENT_UPDATE_DISABLED) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[AppUpdateGate] skip: EXPO_PUBLIC_CLIENT_UPDATE_DISABLED');
      }
      return;
    }
    if (!CLIENT_UPDATE_MANIFEST_URL?.trim()) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[AppUpdateGate] skip: EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL пустой');
      }
      return;
    }
    if (Platform.OS !== 'android') return;
    if (__DEV__ && !CLIENT_UPDATE_CHECK_IN_DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[AppUpdateGate] skip в __DEV__: задай EXPO_PUBLIC_CLIENT_UPDATE_CHECK_IN_DEV=true в .env или собери release',
      );
      return;
    }

    const current = getCurrentAndroidVersionCode();
    if (current === null) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[AppUpdateGate] skip: versionCode недоступен (Expo Go?); используй dev/release APK',
        );
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const manifest = await fetchClientUpdateManifest(CLIENT_UPDATE_MANIFEST_URL.trim());
      if (cancelled || !manifest) {
        if (!cancelled) setMode('idle');
        return;
      }
      const { decision, apkUrl: url } = evaluateAndroidUpdate(manifest, current, CLIENT_RELEASE_TAG);
      if (cancelled) return;
      /** Сначала URL из манифеста (driveApkFileId / apkUrl), иначе вшитый EXPO_PUBLIC_CLIENT_UPDATE_APK_URL — иначе старый APK с GitHub в env вечно игнорирует Drive в JSON. */
      const downloadUrl = (url || CLIENT_UPDATE_APK_URL_OVERRIDE || '').trim();
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[AppUpdateGate]', {
          currentVersionCode: current,
          embeddedReleaseTag: CLIENT_RELEASE_TAG || '(пусто)',
          manifestReleaseTag: manifest.android?.releaseTag ?? '(нет)',
          min: manifest.android?.minVersionCode,
          latest: manifest.android?.latestVersionCode,
          decision,
          downloadUrlFrom: url ? 'manifest' : CLIENT_UPDATE_APK_URL_OVERRIDE ? 'env' : 'none',
        });
      }
      if (decision === 'force' && downloadUrl) {
        setApkUrl(downloadUrl);
        setMode('force');
        return;
      }
      if (decision === 'soft' && downloadUrl) {
        setApkUrl(downloadUrl);
        setMode('soft');
        return;
      }
      setMode('idle');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openDownload = useCallback(async () => {
    if (!apkUrl) return;
    try {
      await Linking.openURL(apkUrl);
    } catch {
      // ignore
    }
  }, [apkUrl]);

  const dismissSoft = useCallback(() => {
    setMode('idle');
    setApkUrl(null);
  }, []);

  if (mode === 'idle') {
    return null;
  }

  const cardStyle: ViewStyle[] = [
    styles.card,
    { backgroundColor: colors.inputBackgroundSolid, borderColor: colors.composerBorder },
  ];

  if (mode === 'force' && apkUrl) {
    return (
      <Modal
        transparent
        animationType="fade"
        visible
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.backdropScrimStrong}>
          <View style={cardStyle}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Требуется обновление</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Установлена устаревшая версия. Обновите приложение, чтобы продолжить.
            </Text>
            <Pressable
              onPress={openDownload}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Скачать обновление</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  if (mode === 'soft' && apkUrl) {
    return (
      <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={dismissSoft}>
        <Pressable style={styles.backdropScrim} onPress={dismissSoft}>
          <Pressable style={cardStyle} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Доступно обновление</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Вышла новая версия. Рекомендуем установить её для лучшей работы.
            </Text>
            <View style={styles.row}>
              <Pressable
                onPress={dismissSoft}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: colors.composerBorder, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Позже</Text>
              </Pressable>
              <Pressable
                onPress={openDownload}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.primaryBtnInline,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
                ]}
              >
                <Text style={styles.primaryBtnText}>Обновить</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  backdropScrim: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropScrimStrong: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnInline: {
    minWidth: 120,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  type ViewStyle,
} from 'react-native';
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
import {
  ApkInstallPermissionRequiredError,
  downloadAndInstallApk,
  openApkInstallPermissionSettings,
  type ApkInstallProgress,
} from '../services/apkUpdateInstaller';

type GateMode = 'idle' | 'force' | 'soft';
type InstallState = 'idle' | 'downloading' | 'permission' | 'installing' | 'error';

/**
 * Проверка манифеста обновления при старте (Android). Ошибки сети/JSON не блокируют приложение.
 */
export function AppUpdateGate() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<GateMode>('idle');
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [progress, setProgress] = useState<ApkInstallProgress | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [currentVersionCode, setCurrentVersionCode] = useState<number | null>(null);

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
    setCurrentVersionCode(current);

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

  useEffect(() => {
    if (installState !== 'installing') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setInstallState('idle');
        setErrorText('Если установка не открылась или была отменена, нажмите «Обновить» ещё раз.');
      }
    });
    return () => sub.remove();
  }, [installState]);

  const openInBrowser = useCallback(async () => {
    if (!apkUrl) return;
    try {
      await Linking.openURL(apkUrl);
    } catch {
      // ignore
    }
  }, [apkUrl]);

  const startInstall = useCallback(async () => {
    if (
      !apkUrl ||
      currentVersionCode === null ||
      installState === 'downloading' ||
      installState === 'installing'
    )
      return;
    setErrorText(null);
    setProgress(null);
    setInstallState('downloading');
    try {
      await downloadAndInstallApk(apkUrl, currentVersionCode, (next) => {
        setProgress(next);
      });
      setInstallState('installing');
    } catch (e) {
      if (e instanceof ApkInstallPermissionRequiredError) {
        setInstallState('permission');
        setErrorText('Разрешите Chatus устанавливать обновления, затем вернитесь и нажмите «Продолжить».');
        await openApkInstallPermissionSettings().catch(() => undefined);
        return;
      }
      setInstallState('error');
      setErrorText('Не удалось скачать или открыть обновление. Проверьте интернет и попробуйте ещё раз.');
    }
  }, [apkUrl, currentVersionCode, installState]);

  const openPermissionSettings = useCallback(async () => {
    await openApkInstallPermissionSettings().catch(() => undefined);
  }, []);

  const dismissSoft = useCallback(() => {
    if (installState === 'downloading' || installState === 'installing') return;
    setMode('idle');
    setApkUrl(null);
    setInstallState('idle');
    setProgress(null);
    setErrorText(null);
  }, [installState]);

  const progressPercent = progress?.percent ?? null;
  const progressLabel = useMemo(() => {
    if (installState === 'downloading') {
      if (progressPercent !== null) return `Скачиваем обновление: ${Math.round(progressPercent * 100)}%`;
      return 'Скачиваем обновление...';
    }
    if (installState === 'installing') return 'Открываем установщик...';
    if (installState === 'permission') return 'Нужно разрешение на установку обновлений';
    return null;
  }, [installState, progressPercent]);
  const isBusy = installState === 'downloading' || installState === 'installing';

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
            <UpdateInstallControls
              colors={colors}
              errorText={errorText}
              installState={installState}
              isBusy={isBusy}
              onBrowserFallback={openInBrowser}
              onOpenPermissionSettings={openPermissionSettings}
              onStartInstall={startInstall}
              progressLabel={progressLabel}
              progressPercent={progressPercent}
              primaryLabel={installState === 'permission' ? 'Продолжить' : 'Скачать и установить'}
            />
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
                disabled={isBusy}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    borderColor: colors.composerBorder,
                    opacity: isBusy ? 0.45 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Позже</Text>
              </Pressable>
              <UpdateInstallControls
                colors={colors}
                errorText={errorText}
                installState={installState}
                isBusy={isBusy}
                onBrowserFallback={openInBrowser}
                onOpenPermissionSettings={openPermissionSettings}
                onStartInstall={startInstall}
                progressLabel={progressLabel}
                progressPercent={progressPercent}
                primaryLabel={installState === 'permission' ? 'Продолжить' : 'Обновить'}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return null;
}

type UpdateInstallControlsProps = {
  colors: ReturnType<typeof useTheme>['colors'];
  errorText: string | null;
  installState: InstallState;
  isBusy: boolean;
  onBrowserFallback: () => void;
  onOpenPermissionSettings: () => void;
  onStartInstall: () => void;
  primaryLabel: string;
  progressLabel: string | null;
  progressPercent: number | null;
};

function UpdateInstallControls({
  colors,
  errorText,
  installState,
  isBusy,
  onBrowserFallback,
  onOpenPermissionSettings,
  onStartInstall,
  primaryLabel,
  progressLabel,
  progressPercent,
}: UpdateInstallControlsProps) {
  return (
    <View style={styles.installControls}>
      {progressLabel ? (
        <View style={styles.progressBlock}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{progressLabel}</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.composerBorder }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.max(4, Math.round((progressPercent ?? 0.08) * 100))}%`,
                },
              ]}
            />
          </View>
        </View>
      ) : null}
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      <Pressable
        disabled={isBusy}
        onPress={onStartInstall}
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.primaryBtnInline,
          { backgroundColor: colors.accent, opacity: isBusy ? 0.65 : pressed ? 0.88 : 1 },
        ]}
      >
        <Text style={styles.primaryBtnText}>{isBusy ? 'Подождите...' : primaryLabel}</Text>
      </Pressable>
      {installState === 'permission' ? (
        <Pressable onPress={onOpenPermissionSettings} style={styles.linkBtn}>
          <Text style={[styles.linkBtnText, { color: colors.accent }]}>Открыть разрешение</Text>
        </Pressable>
      ) : null}
      {installState === 'error' ? (
        <Pressable onPress={onBrowserFallback} style={styles.linkBtn}>
          <Text style={[styles.linkBtnText, { color: colors.accent }]}>Скачать через браузер</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  installControls: {
    alignItems: 'stretch',
    gap: 10,
  },
  progressBlock: {
    gap: 8,
    marginBottom: 2,
    minWidth: 220,
  },
  progressLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressTrack: {
    height: 5,
    overflow: 'hidden',
    borderRadius: 999,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  errorText: {
    color: '#E5484D',
    fontSize: 13,
    lineHeight: 18,
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
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

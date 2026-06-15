import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authStore } from '../stores/authStore';
import { openMiniAppSession, type MiniAppSession } from '../services/miniAppsService';
import {
  buildBridgeScript,
  defaultBridgeThemeFromColors,
  parseBridgeMessage,
  type BridgeInitContext,
} from '../miniapp/bridgeScript';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MiniApp'>;

export function MiniAppScreen({ route, navigation }: Props) {
  const { appId, title } = route.params;
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => createMiniAppStyles(colors, resolvedScheme), [colors, resolvedScheme]);
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [inAppBrowserUrl, setInAppBrowserUrl] = useState<string | null>(null);

  const user = authStore((state) => state.user);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSession(null);
    openMiniAppSession(appId)
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось открыть приложение');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const context: BridgeInitContext | null = useMemo(() => {
    if (!session || !user) return null;
    return {
      session,
      user: {
        id: user.id,
        display_name: user.display_name,
        username: user.username,
        avatar_url: user.avatar_url,
      },
      themeParams: defaultBridgeThemeFromColors(colors),
      colorScheme: resolvedScheme,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      viewportHeight: 0,
    };
  }, [session, user, colors, resolvedScheme]);

  const bridgeScript = useMemo(
    () => (context ? buildBridgeScript(context) : null),
    [context],
  );

  /** WebView may follow OAuth redirects to IdP (e.g. Loginus) — not only the mini-app origin. */
  const loadAllowedHostSet = useMemo(() => {
    const s = new Set<string>();
    if (session) {
      try {
        s.add(new URL(session.base_url).host.toLowerCase());
      } catch {
        /* ignore */
      }
      for (const h of session.allowed_hosts ?? []) {
        const t = h?.trim().toLowerCase();
        if (t) s.add(t);
      }
    }
    s.add('id.startapus.com');
    return s;
  }, [session]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg = parseBridgeMessage(event.nativeEvent.data);
      if (!msg) return;
      switch (msg.type) {
        case 'ready':
          setIsReady(true);
          return;
        case 'close':
          navigation.goBack();
          return;
        case 'sendData':
          // v1: we just acknowledge locally; developer backend can also receive
          // this via `POST /mini-apps/:app_id/data` with init_data from the page.
          return;
        case 'openLink':
          setInAppBrowserUrl(msg.url);
          return;
      }
    },
    [navigation],
  );

  const handleShouldLoad = useCallback(
    (request: { url: string }) => {
      try {
        const url = new URL(request.url);
        if (url.protocol === 'about:' || url.protocol === 'data:') return true;
        if (url.protocol !== 'https:') return false;
        return loadAllowedHostSet.has(url.host.toLowerCase());
      } catch {
        return false;
      }
    },
    [loadAllowedHostSet],
  );

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  if (!session || !bridgeScript) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Закрыть</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title ?? 'Mini App'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.webviewWrap}>
        <WebView
          ref={webViewRef}
          source={{ uri: session.base_url }}
          style={styles.webview}
          originWhitelist={['https://*']}
          injectedJavaScriptBeforeContentLoaded={bridgeScript}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldLoad}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          )}
        />
        {!isReady && (
          <View pointerEvents="none" style={styles.readyOverlay}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )}
      </View>

      {inAppBrowserUrl && (
        <InAppBrowserOverlay
          url={inAppBrowserUrl}
          onClose={() => setInAppBrowserUrl(null)}
          insets={insets}
          styles={styles}
          accent={colors.accent}
        />
      )}
    </View>
  );
}

function InAppBrowserOverlay({
  url,
  onClose,
  insets,
  styles,
  accent,
}: {
  url: string;
  onClose: () => void;
  insets: { top: number; bottom: number };
  styles: ReturnType<typeof createMiniAppStyles>;
  accent: string;
}) {
  const [host, setHost] = useState<string>('');
  useEffect(() => {
    try {
      setHost(new URL(url).host);
    } catch {
      setHost(url);
    }
  }, [url]);

  const openExternally = useCallback(async () => {
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Не удалось открыть', e instanceof Error ? e.message : String(e));
    }
  }, [url]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlayContainer]}>
      <View style={[styles.overlayHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Готово</Text>
        </Pressable>
        <Text style={styles.overlayHost} numberOfLines={1}>
          {host}
        </Text>
        <Pressable onPress={openExternally} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Открыть</Text>
        </Pressable>
      </View>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        )}
      />
    </View>
  );
}

function createMiniAppStyles(colors: ThemeColors, resolvedScheme: 'light' | 'dark') {
  const readyTint =
    resolvedScheme === 'dark' ? 'rgba(30,42,53,0.92)' : 'rgba(255,255,255,0.9)';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.chatBackground },
    center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.toolbar,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    headerBtn: {
      minWidth: 72,
    },
    headerBtnText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '600',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    webviewWrap: { flex: 1 },
    webview: { flex: 1, backgroundColor: colors.chatBackground },
    loading: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.chatBackground,
    },
    readyOverlay: {
      position: 'absolute',
      right: 16,
      bottom: 16,
      padding: 8,
      borderRadius: 12,
      backgroundColor: readyTint,
    },
    errorText: {
      color: colors.textPrimary,
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 16,
    },
    backBtn: {
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: 20,
      backgroundColor: colors.accent,
    },
    backBtnText: { color: '#fff', fontWeight: '600' },
    overlayContainer: {
      backgroundColor: colors.inputBackgroundSolid,
    },
    overlayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 8,
      backgroundColor: colors.toolbar,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    overlayHost: {
      flex: 1,
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
}

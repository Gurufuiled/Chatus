import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ImageBackground,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL, PRIVACY_POLICY_URL } from '../config';
import { authService, type AuthSession } from '../services/AuthService';
import { PressScale } from '../components/PressScale';

type Props = {
  onLoginSession: (session: AuthSession) => Promise<void>;
};

type AuthWebPayload = {
  type?: string;
  code?: string;
  redirect_uri?: string;
  error?: string;
};

function parseAuthCallbackUrl(url: string): AuthWebPayload | null {
  try {
    const u = new URL(url);
    const error = u.searchParams.get('error');
    const code = u.searchParams.get('code');
    // Без code/error это не завершение OAuth — не трогаем WebView (иначе мерцание и закрытие).
    if (!error && !code) return null;

    const isAppSchemeCallback = u.protocol === 'messenger:' && u.href.includes('auth/callback');
    const isApiCallback = u.protocol.startsWith('http') && u.pathname.endsWith('/auth/callback');
    if (!isAppSchemeCallback && !isApiCallback) return null;

    if (error) return { type: 'auth', error };
    return { type: 'auth', code: code ?? undefined };
  } catch {
    return null;
  }
}

const AUTH_BG = require('../../assets/splash/auth-bg-clean.png');
const PRIVACY_CONSENT_STORAGE_KEY = '@chatus/privacy_policy_accepted_v1';

/** Dev (USB / emulator) vs remote API — тексты ошибок не должны вводить в заблуждение на release. */
function apiNetworkHint(): string {
  try {
    const u = new URL(API_BASE_URL);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return ' Запусти бэкенд и при USB с телефоном выполни `npm run adb:reverse`.';
    }
  } catch {
    /* ignore */
  }
  return ' Проверь интернет и что с телефона открывается API (порты 4000–4002, сеть не блокирует IP).';
}

/**
 * Loginus в WebView на Android часто отдаёт полю type=tel → цифровая клавиатура.
 * Подменяем на email + inputmode=email, чтобы была буквенная раскладка (логин/почта/телефон с +).
 */
const LOGINUS_KEYBOARD_FIX_JS = `
(function() {
  function looksLikeLoginField(input) {
    const text = [
      input.placeholder || '',
      input.name || '',
      input.id || '',
      input.getAttribute('aria-label') || '',
      input.getAttribute('autocomplete') || ''
    ].join(' ').toLowerCase();

    return (
      text.includes('email') ||
      text.includes('mail') ||
      text.includes('phone') ||
      text.includes('login') ||
      text.includes('account') ||
      text.includes('user') ||
      text.includes('телефон') ||
      text.includes('почт') ||
      text.includes('логин') ||
      text.includes('аккаунт')
    );
  }

  function patchSoft(input) {
    if (!input || !looksLikeLoginField(input)) return;
    input.setAttribute('inputmode', 'email');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocomplete', 'username');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
  }

  function patchFocused(input) {
    if (!input || !looksLikeLoginField(input)) return;
    patchSoft(input);
    try {
      if (input.type === 'tel' || input.type === 'number') {
        input.type = 'email';
      }
    } catch (e) {}
    input.setAttribute('enterkeyhint', 'next');
  }

  function patchExistingInputs() {
    var inputs = document.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      patchSoft(inputs[i]);
    }
  }

  patchExistingInputs();

  document.addEventListener('focusin', function(event) {
    if (event && event.target && event.target.tagName === 'INPUT') {
      setTimeout(function() {
        patchFocused(event.target);
      }, 0);
    }
  }, true);

  var observer = new MutationObserver(function() {
    patchExistingInputs();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function() { observer.disconnect(); }, 45000);

  true;
})();
`;

function BrandHeader() {
  const logoFloat = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordTranslateY = useRef(new Animated.Value(10)).current;
  const shimmerX = useRef(new Animated.Value(-90)).current;
  const dotWave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(wordOpacity, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(wordTranslateY, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {
          toValue: -4,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoFloat, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(shimmerX, {
          toValue: 230,
          duration: 1700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerX, {
          toValue: -90,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(900),
      ])
    );

    const dotsLoop = Animated.loop(
      Animated.timing(dotWave, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    floatLoop.start();
    shimmerLoop.start();
    dotsLoop.start();

    return () => {
      floatLoop.stop();
      shimmerLoop.stop();
      dotsLoop.stop();
    };
  }, [dotWave, logoFloat, shimmerX, wordOpacity, wordTranslateY]);

  const dotStyle = (start: number, end: number) => ({
    opacity: dotWave.interpolate({
      inputRange: [0, start, end, 1],
      outputRange: [0.45, 1, 0.45, 0.45],
    }),
    transform: [
      {
        scale: dotWave.interpolate({
          inputRange: [0, start, end, 1],
          outputRange: [1, 1.18, 1, 1],
        }),
      },
    ],
  });

  return (
    <View pointerEvents="none" style={styles.brandWrap}>
      <Animated.View style={[styles.brandRow, { transform: [{ translateY: logoFloat }] }]}>
        <View style={styles.chatIcon}>
          <Animated.View style={[styles.chatDot, dotStyle(0.04, 0.18)]} />
          <Animated.View style={[styles.chatDot, dotStyle(0.18, 0.32)]} />
          <Animated.View style={[styles.chatDot, dotStyle(0.32, 0.46)]} />
        </View>

        <Animated.View
          style={[
            styles.wordWrap,
            {
              opacity: wordOpacity,
              transform: [{ translateY: wordTranslateY }],
            },
          ]}
        >
          <Text style={styles.brandText}>Chatus</Text>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.wordShimmer,
              {
                transform: [{ translateX: shimmerX }, { rotate: '16deg' }],
              },
            ]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function LoginScreen({ onLoginSession }: Props) {
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const authHandledRef = useRef(false);
  const redirectUriRef = useRef('');
  const loginWebViewRef = useRef<WebView>(null);

  useEffect(() => {
    void SecureStore.getItemAsync(PRIVACY_CONSENT_STORAGE_KEY).then((v) => {
      if (v === '1') setPrivacyAccepted(true);
    });
  }, []);

  const togglePrivacyAccepted = useCallback(() => {
    setPrivacyAccepted((prev) => {
      const next = !prev;
      void SecureStore.setItemAsync(PRIVACY_CONSENT_STORAGE_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  }, []);

  const openPrivacyPolicy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
      Alert.alert('Ошибка', 'Не удалось открыть политику конфиденциальности.');
    });
  }, []);

  const finishAuthPayload = useCallback(
    async (payload: AuthWebPayload, redirectUriFallback: string) => {
      if (authHandledRef.current) return;
      if (payload?.type !== 'auth') return;

      if (payload.error) {
        authHandledRef.current = true;
        Alert.alert('Ошибка входа', payload.error);
        setLoginUrl(null);
        setExchanging(false);
        return;
      }

      if (!payload.code) return;

      authHandledRef.current = true;
      setExchanging(true);
      try {
        const redirectUri = payload.redirect_uri ?? redirectUriFallback;
        const session = await authService.loginWithCode(payload.code, redirectUri);
        await onLoginSession(session);
        setLoginUrl(null);
      } catch (e) {
        console.error('[Auth] exchange failed', e);
        authHandledRef.current = false;
        setLoginUrl(null);
        Alert.alert(
          'Ошибка входа',
          e instanceof Error
            ? e.message
            : `Не удалось обменять код.${apiNetworkHint()}`,
        );
      } finally {
        setExchanging(false);
      }
    },
    [onLoginSession],
  );

  const handleLoginPress = useCallback(async () => {
    if (loading) return;
    if (!privacyAccepted) {
      Alert.alert(
        'Согласие обязательно',
        'Чтобы войти, подтвердите, что вы ознакомились с политикой конфиденциальности и принимаете условия обработки персональных данных.',
      );
      return;
    }
    setLoading(true);
    authHandledRef.current = false;
    try {
      const { url, redirect_uri } = await authService.getLoginUrl();
      redirectUriRef.current = redirect_uri;
      setWebViewLoading(true);
      setLoginUrl(url);
    } catch (err) {
      const hint = apiNetworkHint();
      const detail =
        err instanceof Error && err.message ? `\n\n(${err.message})` : '';
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? `Сервер не ответил за 30 с.${hint}${detail}`
          : `Сервер недоступен.${hint}${detail}`;
      Alert.alert(
        'Ошибка сети',
        `${msg}\n\nЗапрос к API:\n${API_BASE_URL}/auth/login-url`,
      );
    } finally {
      setLoading(false);
    }
  }, [loading, privacyAccepted]);

  const onMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as AuthWebPayload;
        await finishAuthPayload(data, redirectUriRef.current);
      } catch (e) {
        console.error('[Auth] onMessage parse error', e);
      }
    },
    [finishAuthPayload],
  );

  if (loginUrl) {
    return (
      <SafeAreaView style={styles.loginWebSafe} edges={['top', 'bottom', 'left', 'right']}>
        <WebView
          ref={loginWebViewRef}
          source={{ uri: loginUrl }}
          style={styles.webview}
          originWhitelist={['https://*', 'http://*']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          injectedJavaScript={LOGINUS_KEYBOARD_FIX_JS}
          onLoadStart={() => setWebViewLoading(true)}
          onLoadEnd={() => {
            setWebViewLoading(false);
            loginWebViewRef.current?.injectJavaScript(LOGINUS_KEYBOARD_FIX_JS);
          }}
          onMessage={onMessage}
          onNavigationStateChange={(nav) => {
            const parsed = parseAuthCallbackUrl(nav.url);
            if (parsed) {
              void finishAuthPayload(parsed, redirectUriRef.current);
            }
          }}
          onError={(e) => {
            console.warn('[Auth] WebView onError', e.nativeEvent);
            setLoginUrl(null);
            setWebViewLoading(false);
            setExchanging(false);
            authHandledRef.current = false;
            Alert.alert(
              'Ошибка загрузки',
              `Не удалось загрузить страницу входа.${apiNetworkHint()}`
            );
          }}
          onHttpError={(e) => {
            console.warn('[Auth] WebView onHttpError', e.nativeEvent.statusCode, e.nativeEvent.url);
          }}
        />
        {webViewLoading && !exchanging ? (
          <View style={styles.exchangeOverlay}>
            <ActivityIndicator size="large" color="#0A84FF" />
            <Text style={styles.exchangeText}>Открываем Loginus…</Text>
          </View>
        ) : null}
        {exchanging ? (
          <View style={styles.exchangeOverlay}>
            <ActivityIndicator size="large" color="#0A84FF" />
            <Text style={styles.exchangeText}>Вход в Chatus…</Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.rootFill}>
      <ImageBackground source={AUTH_BG} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
        <View style={styles.overlay} />
      </ImageBackground>
      <SafeAreaView style={styles.welcomeSafe} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <BrandHeader />
        <View style={styles.content}>
          <View style={styles.footerWrap}>
            <PressScale
              style={[
                styles.button,
                loading && styles.buttonPressed,
                !privacyAccepted && styles.buttonDisabled,
              ]}
              pressedScale={0.96}
              onPress={handleLoginPress}
              disabled={loading || !privacyAccepted}
              accessibilityRole="button"
              accessibilityLabel="Войти с помощью Loginus"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Войти с помощью Loginus</Text>
              )}
            </PressScale>
            <View style={styles.privacyRow}>
              <Pressable
                style={[styles.privacyBox, privacyAccepted && styles.privacyBoxOn]}
                onPress={togglePrivacyAccepted}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: privacyAccepted }}
                accessibilityLabel="Согласие с политикой конфиденциальности"
                hitSlop={8}
              >
                {privacyAccepted ? <Text style={styles.privacyCheck}>✓</Text> : null}
              </Pressable>
              <Text style={styles.privacyText}>
                Я принимаю{' '}
                <Text style={styles.privacyLink} onPress={openPrivacyPolicy}>
                  политику конфиденциальности
                </Text>{' '}
                и даю согласие на обработку персональных данных
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootFill: {
    flex: 1,
  },
  welcomeSafe: {
    flex: 1,
  },
  loginWebSafe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
  },
  exchangeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  exchangeText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  brandWrap: {
    position: 'absolute',
    top: '10.4%',
    left: 28,
    right: 28,
    alignItems: 'center',
    zIndex: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  chatIcon: {
    width: 78,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(112, 212, 242, 0.22)',
    borderWidth: 2,
    borderColor: 'rgba(90, 122, 228, 0.62)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#7FC6EC',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  chatDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  wordWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  brandText: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '800',
    color: '#6FB6AF',
    letterSpacing: -1.2,
    textShadowColor: 'rgba(255,255,255,0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  wordShimmer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    width: 52,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
  footerWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 28,
    alignItems: 'center',
    gap: 16,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    maxWidth: 340,
    paddingHorizontal: 4,
  },
  privacyBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(15, 23, 42, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  privacyBoxOn: {
    borderColor: '#0A84FF',
    backgroundColor: '#0A84FF',
  },
  privacyCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
    fontWeight: '500',
  },
  privacyLink: {
    color: '#0A84FF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  button: {
    minWidth: 260,
    backgroundColor: '#0A84FF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#062345',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0.06,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

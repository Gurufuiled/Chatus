import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL } from '../config';
import { authService } from '../services/AuthService';

type Props = {
  onLogin: () => void;
};

const AUTH_BG = require('../../assets/splash/auth-bg-clean.png');

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
        text.includes('телефон') ||
        text.includes('почт')
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

export function LoginScreen({ onLogin }: Props) {
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoginPress = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${API_BASE_URL}/auth/login-url`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = (await res.json()) as { url?: string };
      if (data?.url) {
        setLoginUrl(data.url);
      } else {
        Alert.alert('Ошибка', 'Не удалось получить ссылку для входа.');
      }
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
  }, []);

  const onMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type !== 'auth') return;

        if (data?.error) {
          Alert.alert('Ошибка входа', data.error);
          setLoginUrl(null);
          return;
        }

        if (!data?.code) return;

        console.log('[Auth] onMessage: got code, calling loginWithCode');
        await authService.loginWithCode(data.code, data.redirect_uri ?? '');
        console.log('[Auth] onMessage: loginWithCode OK, calling onLogin');
        await onLogin();
        setLoginUrl(null);
        console.log('[Auth] onMessage: onLogin OK');
      } catch (e) {
        console.error('[Auth] onMessage: error', e);
        setLoginUrl(null);
        Alert.alert(
          'Ошибка входа',
          e instanceof Error
            ? e.message
            : `Не удалось обменять код.${apiNetworkHint()}`
        );
      }
    },
    [onLogin]
  );

  if (loginUrl) {
    return (
      <View style={styles.container}>
        <WebView
          source={{ uri: loginUrl }}
          style={styles.webview}
          originWhitelist={['https://*', 'http://*']}
          injectedJavaScriptBeforeContentLoaded={LOGINUS_KEYBOARD_FIX_JS}
          injectedJavaScript={LOGINUS_KEYBOARD_FIX_JS}
          onMessage={onMessage}
          onError={(e) => {
            console.warn('[Auth] WebView onError', e.nativeEvent);
            setLoginUrl(null);
            Alert.alert(
              'Ошибка загрузки',
              `Не удалось загрузить страницу входа.${apiNetworkHint()}`
            );
          }}
        />
      </View>
    );
  }

  return (
    <ImageBackground source={AUTH_BG} resizeMode="cover" style={styles.background}>
      <View style={styles.overlay} />
      <BrandHeader />
      <View style={styles.content}>
        <View style={styles.buttonWrap}>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleLoginPress}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Войти с помощью Loginus</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  background: {
    flex: 1,
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
  buttonWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '72%',
    alignItems: 'center',
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

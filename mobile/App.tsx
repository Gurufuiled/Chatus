import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { appLinking } from './src/navigation/linking';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { CallProvider } from './src/contexts/CallContext';
import { GroupCallProvider } from './src/contexts/GroupCallContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { VoicePlayerProvider } from './src/contexts/VoicePlayerContext';
import { WebSocketProvider } from './src/contexts/WebSocketProvider';
import { BootstrapErrorBoundary } from './src/components/BootstrapErrorBoundary';
import { RootNavigator } from './src/navigation';
import { colors } from './src/theme/colors';
import { InAppPushNotification } from './src/components/InAppPushNotification';
import { AppUpdateGate } from './src/components/AppUpdateGate';
import { initDatabase } from './src/services/DatabaseService';
import { authService, type AuthSession } from './src/services/AuthService';
import { uiStore } from './src/stores/uiStore';
import { telegramAccountStore } from './src/stores/telegramAccountStore';
import { TelegramTdlibNotificationListener } from './src/components/TelegramTdlibNotificationListener';
import { ensureAndroidPushChannels } from './src/services/pushNotificationsService';
import { prefetchMessageTimeFormat } from './src/utils/formatMessageTime';

// Keep the native launch screen (solid color, no icon) while DB/session hydrate.
// Avoids a second React-rendered splash with the Chatus icon square.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 220, fade: true });

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialSession, setInitialSession] = useState<AuthSession | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        await uiStore.getState().hydrateAppAppearance();
        await uiStore.getState().hydrateChatListFilter();
        await telegramAccountStore.getState().hydrate();
        await ensureAndroidPushChannels();
        await prefetchMessageTimeFormat();
        return authService.restoreSession();
      })
      .then((session) => {
        setInitialSession(session);
        setIsReady(true);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[App bootstrap]', e);
        setBootstrapError(message);
        setIsReady(true);
      });
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => {
        SplashScreen.hide();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  if (bootstrapError) {
    return (
      <View style={styles.errorWrap}>
        <StatusBar style="auto" />
        <Text style={styles.errorTitle}>Не удалось запустить (БД / сессия)</Text>
        <Text selectable style={styles.errorText}>
          {bootstrapError}
        </Text>
        <Text style={styles.errorHint}>
          Полный лог смотри в терминале Metro (npx expo start) или в Xcode → Debug console.
        </Text>
      </View>
    );
  }

  return (
    <BootstrapErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <SafeAreaProvider>
            <AuthProvider initialSession={initialSession}>
              <WebSocketProvider>
                <VoicePlayerProvider>
                  <CallProvider>
                    <GroupCallProvider>
                      <ThemedNavigationContainer>
                        <ThemedStatusBar />
                        <RootNavigator />
                        <InAppPushNotification />
                        <TelegramTdlibNotificationListener />
                        <AppUpdateGate />
                      </ThemedNavigationContainer>
                    </GroupCallProvider>
                  </CallProvider>
                </VoicePlayerProvider>
              </WebSocketProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </BootstrapErrorBoundary>
  );
}

function ThemedNavigationContainer({ children }: { children: React.ReactNode }) {
  const { colors: themeColors, resolvedScheme } = useTheme();
  const navTheme = React.useMemo(() => {
    const base = resolvedScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: themeColors.chatBackground,
        card: themeColors.chatBackground,
      },
    };
  }, [themeColors.chatBackground, resolvedScheme]);

  return (
    <NavigationContainer linking={appLinking as never} theme={navTheme}>
      {children}
    </NavigationContainer>
  );
}

function ThemedStatusBar() {
  const { resolvedScheme } = useTheme();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

const styles = StyleSheet.create({
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.inputBackgroundSolid,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#c00', marginBottom: 12 },
  errorText: { fontSize: 15, color: colors.textPrimary, marginBottom: 16 },
  errorHint: { fontSize: 13, color: colors.textSecondary },
});

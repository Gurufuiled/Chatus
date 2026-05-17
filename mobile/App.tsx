import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { appLinking } from './src/navigation/linking';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { CallProvider } from './src/contexts/CallContext';
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

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialSession, setInitialSession] = useState<AuthSession | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        await uiStore.getState().hydrateAppAppearance();
        await telegramAccountStore.getState().hydrate();
        await ensureAndroidPushChannels();
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

  if (!isReady) {
    return (
      <View style={styles.center}>
        <Image
          accessibilityIgnoresInvertColors
          source={require('./assets/chatus_icon.png')}
          style={styles.bootLogo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={colors.accent} style={styles.bootSpinner} />
        <StatusBar style="auto" />
      </View>
    );
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
                    <NavigationContainer linking={appLinking as never}>
                      <ThemedStatusBar />
                      <RootNavigator />
                      <InAppPushNotification />
                      <TelegramTdlibNotificationListener />
                      <AppUpdateGate />
                    </NavigationContainer>
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

function ThemedStatusBar() {
  const { resolvedScheme } = useTheme();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.chatBackground,
  },
  bootLogo: {
    width: 96,
    height: 96,
    marginBottom: 20,
  },
  bootSpinner: {
    marginTop: 4,
  },
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

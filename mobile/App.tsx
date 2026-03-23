import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { CallProvider } from './src/contexts/CallContext';
import { VoicePlayerProvider } from './src/contexts/VoicePlayerContext';
import { WebSocketProvider } from './src/contexts/WebSocketProvider';
import { RootNavigator } from './src/navigation';
import { initDatabase } from './src/services/DatabaseService';
import { authService, type AuthSession } from './src/services/AuthService';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialSession, setInitialSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => authService.restoreSession())
      .then((session) => {
        setInitialSession(session);
        setIsReady(true);
      })
      .catch(() => setIsReady(true)); // Show app anyway for navigation testing
  }, []);

  if (!isReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider initialSession={initialSession}>
        <WebSocketProvider>
          <VoicePlayerProvider>
            <CallProvider>
              <NavigationContainer>
                <RootNavigator />
                <StatusBar style="auto" />
              </NavigationContainer>
            </CallProvider>
          </VoicePlayerProvider>
        </WebSocketProvider>
      </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

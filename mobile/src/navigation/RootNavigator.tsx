import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SloWebView } from '../components/SloWebView';
import { useAuth } from '../contexts/AuthContext';
import { uiStore } from '../stores/uiStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';

export function RootNavigator() {
  const { isLoading, isAuthenticated, login } = useAuth();

  React.useEffect(() => {
    void uiStore.getState().hydrateChatThemes();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <MainTabs />;
  }

  return (
    <>
      <AuthStack onLogin={login} />
      <SloWebView />
    </>
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

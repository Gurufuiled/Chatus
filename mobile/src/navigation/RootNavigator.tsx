import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SloWebView } from '../components/SloWebView';
import { useAuth } from '../contexts/AuthContext';
import { uiStore } from '../stores/uiStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { useTheme } from '../contexts/ThemeContext';

export function RootNavigator() {
  const { isLoading, isAuthenticated, completeLoginSession } = useAuth();
  const { colors } = useTheme();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        center: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.inputBackgroundSolid,
        },
      }),
    [colors]
  );

  React.useEffect(() => {
    void uiStore.getState().hydrateChatThemes();
    void uiStore.getState().hydrateChatWallpapers();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (isAuthenticated) {
    return <MainTabs />;
  }

  return (
    <>
      <AuthStack onLoginSession={completeLoginSession} />
      <SloWebView />
    </>
  );
}

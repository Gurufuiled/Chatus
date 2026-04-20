import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsScreen, ServicesScreen } from '../screens';
import { MiniAppScreen } from '../screens/MiniAppScreen';
import { colors } from '../theme/colors';
import type { SettingsStackParamList } from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator
      id={undefined as never}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.toolbar },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="SettingsMain"
        component={SettingsScreen}
        options={{ title: 'Настройки' }}
      />
      <Stack.Screen
        name="Services"
        component={ServicesScreen}
        options={{ title: 'Сервисы', headerBackTitle: 'Назад' }}
      />
      <Stack.Screen
        name="MiniApp"
        component={MiniAppScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

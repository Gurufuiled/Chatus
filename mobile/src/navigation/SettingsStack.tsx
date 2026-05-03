import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  AppearanceSettingsScreen,
  EditProfileScreen,
  FeedbackComposeScreen,
  FeedbackListScreen,
  MyProfileScreen,
  SettingsScreen,
  ServicesScreen,
  TelegramAuthScreen,
  TelegramChatScreen,
  TelegramDialogsScreen,
} from '../screens';
import { MiniAppScreen } from '../screens/MiniAppScreen';
import { useTheme } from '../contexts/ThemeContext';
import type { SettingsStackParamList } from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  const { colors } = useTheme();
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
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MyProfile"
        component={MyProfileScreen}
        options={{ title: 'Профиль', headerBackTitle: 'Назад' }}
      />
      <Stack.Screen
        name="Appearance"
        component={AppearanceSettingsScreen}
        options={{ title: 'Оформление', headerBackTitle: 'Назад' }}
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
      <Stack.Screen
        name="FeedbackList"
        component={FeedbackListScreen}
        options={{ headerBackTitle: 'Назад' }}
      />
      <Stack.Screen
        name="FeedbackCompose"
        component={FeedbackComposeScreen}
        options={{ headerBackTitle: 'Назад' }}
      />
      <Stack.Screen
        name="TelegramAuth"
        component={TelegramAuthScreen}
        options={{ title: 'Telegram', headerBackTitle: 'Назад' }}
      />
      <Stack.Screen
        name="TelegramDialogs"
        component={TelegramDialogsScreen}
        options={{ title: 'Telegram', headerBackTitle: 'Назад' }}
      />
      <Stack.Screen
        name="TelegramChat"
        component={TelegramChatScreen}
        options={({ route }) => ({
          title: route.params.title ?? 'Чат',
          headerBackTitle: 'Назад',
        })}
      />
    </Stack.Navigator>
  );
}

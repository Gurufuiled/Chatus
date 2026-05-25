import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { StyleSheet } from 'react-native';
import { ChatsStack } from './ChatsStack';
import { SettingsStack } from './SettingsStack';
import { ContactsScreen } from '../screens';
import type { MainTabParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';
import { TelegramBottomTabBar } from './TelegramBottomTabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

const HIDDEN_TAB_BAR = StyleSheet.create({
  hidden: { display: 'none' },
}).hidden;

/** Показываем tab bar только на корневом списке чатов; все вложенные экраны — без панели (как в Telegram). */
const CHAT_STACK_SHOW_TAB_ROUTES = new Set(['ChatList']);

const SETTINGS_HIDE_TAB_ROUTES = new Set(['MiniApp', 'Services', 'EditProfile', 'MyProfile']);

export function MainTabs() {
  const { colors: themeColors } = useTheme();

  return (
    <Tab.Navigator
      id={undefined as never}
      tabBar={(props) => <TelegramBottomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: themeColors.toolbar,
        },
        headerShadowVisible: false,
        headerTintColor: themeColors.textPrimary,
        headerTitleStyle: {
          color: themeColors.textPrimary,
          fontWeight: '700',
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsStack}
        options={({ route }) => {
          const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'ChatList';
          const shouldHideTabBar = !CHAT_STACK_SHOW_TAB_ROUTES.has(focusedRoute);
          return {
            title: 'Чаты',
            headerShown: false,
            tabBarStyle: shouldHideTabBar ? HIDDEN_TAB_BAR : undefined,
          };
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          title: 'Контакты',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route) ?? 'SettingsMain';
          const hide = SETTINGS_HIDE_TAB_ROUTES.has(focused);
          return {
            title: 'Настройки',
            headerShown: false,
            tabBarStyle: hide ? HIDDEN_TAB_BAR : undefined,
          };
        }}
      />
    </Tab.Navigator>
  );
}

import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import {
  getFocusedRouteNameFromRoute,
  type NavigationProp,
  useNavigation,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformPressable } from '@react-navigation/elements';
import { ActionSheetIOS, Alert, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { ChatsStack } from './ChatsStack';
import { SettingsStack } from './SettingsStack';
import { ContactsScreen } from '../screens';
import type { MainTabParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { chatStore } from '../stores/chatStore';
import { inboxModeStore, type InboxMode } from '../stores/inboxModeStore';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_TAB_GLYPHS } from '../icons/telegram/tabPaths';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconProps = {
  color: string;
  focused: boolean;
};

function TabTelegramIcon({
  tab,
  color,
  focused,
  tabStyles,
}: IconProps & {
  tab: 'contacts' | 'chats' | 'settings';
  tabStyles: ReturnType<typeof createMainTabsStyles>;
}) {
  const glyphs = TELEGRAM_TAB_GLYPHS[tab];
  const glyph = focused ? glyphs.active : glyphs.inactive;
  return (
    <View style={[tabStyles.iconFrame, focused && tabStyles.iconFocused]}>
      <TelegramGlyph
        d={glyph.d}
        fillRule={glyph.fillRule}
        color={color}
        size={24}
      />
    </View>
  );
}

function getTabIcon(
  routeName: keyof MainTabParamList,
  color: string,
  focused: boolean,
  tabStyles: ReturnType<typeof createMainTabsStyles>
) {
  switch (routeName) {
    case 'Contacts':
      return (
        <TabTelegramIcon tab="contacts" color={color} focused={focused} tabStyles={tabStyles} />
      );
    case 'Settings':
      return (
        <TabTelegramIcon tab="settings" color={color} focused={focused} tabStyles={tabStyles} />
      );
    case 'Chats':
    default:
      return <TabTelegramIcon tab="chats" color={color} focused={focused} tabStyles={tabStyles} />;
  }
}

function getTabLabel(routeName: keyof MainTabParamList) {
  switch (routeName) {
    case 'Contacts':
      return 'Контакты';
    case 'Settings':
      return 'Настройки';
    case 'Chats':
    default:
      return 'Чаты';
  }
}

function TabBarItem({
  routeName,
  color,
  focused,
  styles: tabStyles,
}: {
  routeName: keyof MainTabParamList;
  color: string;
  focused: boolean;
  styles: ReturnType<typeof createMainTabsStyles>;
}) {
  const totalUnreadCount = chatStore(
    React.useCallback((state) => {
      if (routeName !== 'Chats') return 0;
      return state.chats.reduce((acc, chat) => acc + Math.max(0, chat.unread_count ?? 0), 0);
    }, [routeName])
  );

  const showBadge = routeName === 'Chats' && totalUnreadCount > 0;
  const badgeLabel = totalUnreadCount > 999 ? '999+' : String(totalUnreadCount);

  return (
    <View style={[tabStyles.tabButton, focused && tabStyles.tabButtonActive]}>
      <View style={tabStyles.tabButtonContent}>
        <View>
          {getTabIcon(routeName, color, focused, tabStyles)}
          {showBadge && (
            <View style={tabStyles.tabBadge}>
              <Text style={tabStyles.tabBadgeText} numberOfLines={1} adjustsFontSizeToFit>{badgeLabel}</Text>
            </View>
          )}
        </View>
        <Text style={[tabStyles.customLabel, { color }]} numberOfLines={1}>
          {getTabLabel(routeName)}
        </Text>
      </View>
    </View>
  );
}

function AnimatedTabButton(props: BottomTabBarButtonProps) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.85,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 12,
    }).start();
  };

  return (
    <PlatformPressable
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={props.style}
    >
      <Animated.View style={[{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }, { transform: [{ scale }] }]}>
        {props.children}
      </Animated.View>
    </PlatformPressable>
  );
}

function SettingsInboxTabButton(props: BottomTabBarButtonProps) {
  const navigation = useNavigation<NavigationProp<MainTabParamList>>();

  const switchInbox = React.useCallback(
    (mode: InboxMode) => {
      if (mode === 'telegram' && telegramAccountStore.getState().authStatus !== 'ready') {
        Alert.alert('Telegram', 'Сначала подключите Telegram в настройках.');
        return;
      }
      inboxModeStore.getState().setActiveInbox(mode);
      navigation.navigate('Chats', { screen: 'ChatList' });
    },
    [navigation],
  );

  const openPicker = React.useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Loginus', 'Telegram', 'Отмена'],
          cancelButtonIndex: 2,
          title: 'Показывать чаты',
        },
        (buttonIndex) => {
          if (buttonIndex === 0) switchInbox('loginus');
          if (buttonIndex === 1) switchInbox('telegram');
        },
      );
      return;
    }

    Alert.alert('Показывать чаты', 'Выберите аккаунт для раздела «Чаты».', [
      { text: 'Loginus', onPress: () => switchInbox('loginus') },
      { text: 'Telegram', onPress: () => switchInbox('telegram') },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }, [switchInbox]);

  return <AnimatedTabButton {...props} onLongPress={openPicker} />;
}

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors: themeColors, resolvedScheme } = useTheme();
  const inboxHydrated = inboxModeStore((state) => state.isHydrated);
  const tabInactiveTint = resolvedScheme === 'dark' ? '#9AA0A6' : '#273142';
  const styles = React.useMemo(() => createMainTabsStyles(themeColors), [themeColors]);
  const tabBarStyle = React.useMemo(
    () => [
      styles.tabBar,
      {
        height: 57 + Math.max(insets.bottom, 0),
        paddingBottom: Math.max(insets.bottom, 5),
      },
    ],
    [insets.bottom, styles.tabBar]
  );

  React.useEffect(() => {
    if (!inboxHydrated) {
      void inboxModeStore.getState().hydrate();
    }
  }, [inboxHydrated]);

  return (
    <Tab.Navigator
      id={undefined as never}
      screenOptions={({ route }) => ({
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
        tabBarActiveTintColor: themeColors.accent,
        tabBarInactiveTintColor: tabInactiveTint,
        tabBarItemStyle: styles.nativeTabItem,
        tabBarStyle,
        tabBarIcon: ({ color, focused }) => (
          <TabBarItem routeName={route.name} color={color} focused={focused} styles={styles} />
        ),
      })}
    >
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          title: 'Контакты',
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      <Tab.Screen
        name="Chats"
        component={ChatsStack}
        options={({ route }) => {
          const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'ChatList';
          const shouldHideTabBar =
            focusedRoute === 'Chat' ||
            focusedRoute === 'ChatProfile' ||
            focusedRoute === 'CreateGroupChat' ||
            focusedRoute === 'GroupProfile' ||
            focusedRoute === 'ChannelCatalog' ||
            focusedRoute === 'ChannelLinkSlug' ||
            focusedRoute === 'ChannelLinkInvite' ||
            focusedRoute === 'ChannelPreview' ||
            focusedRoute === 'ChannelFeed' ||
            focusedRoute === 'ChannelDiscussion' ||
            focusedRoute === 'CreateChannel' ||
            focusedRoute === 'ChannelAdmin' ||
            focusedRoute === 'ComposeMessage' ||
            focusedRoute === 'CreateContact' ||
            focusedRoute === 'TelegramChat' ||
            focusedRoute === 'TelegramChatProfile';

          return {
            title: 'Чаты',
            headerShown: false,
            tabBarStyle: shouldHideTabBar ? styles.hiddenTabBar : tabBarStyle,
            tabBarButton: (props) => <AnimatedTabButton {...props} />,
          };
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route) ?? 'SettingsMain';
          const hide =
            focused === 'MiniApp' ||
            focused === 'Services' ||
            focused === 'EditProfile' ||
            focused === 'MyProfile';
          return {
            title: 'Настройки',
            headerShown: false,
            tabBarStyle: hide ? styles.hiddenTabBar : tabBarStyle,
            tabBarButton: (props) => <SettingsInboxTabButton {...props} />,
          };
        }}
      />
    </Tab.Navigator>
  );
}

function createMainTabsStyles(themeColors: ThemeColors) {
  return StyleSheet.create({
  tabBar: {
    height: 57,
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 10,
    backgroundColor: themeColors.inputBackgroundSolid,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeColors.separator,
    elevation: 0,
    shadowOpacity: 0,
  },
  hiddenTabBar: {
    display: 'none',
  },
  nativeTabItem: {
    paddingVertical: 0,
  },
  tabButton: {
    height: 43,
    minWidth: 0,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabButtonActive: {
    backgroundColor: 'transparent',
  },
  tabButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  customLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
    minWidth: 56,
  },
  iconFrame: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFocused: {
    transform: [{ scale: 1.03 }],
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#FF3B30',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: themeColors.inputBackgroundSolid,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
}

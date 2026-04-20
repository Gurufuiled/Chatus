import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import {
  getFocusedRouteNameFromRoute,
  useNavigation,
  type NavigationProp,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatsStack } from './ChatsStack';
import { SettingsStack } from './SettingsStack';
import { ContactsScreen } from '../screens';
import type { MainTabParamList } from './types';
import { colors } from '../theme/colors';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_TAB_GLYPHS } from '../icons/telegram/tabPaths';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconProps = {
  color: string;
  focused: boolean;
};

function TabTelegramIcon({
  tab,
  color,
  focused,
}: IconProps & { tab: 'contacts' | 'chats' | 'settings' }) {
  const glyphs = TELEGRAM_TAB_GLYPHS[tab];
  const glyph = focused ? glyphs.active : glyphs.inactive;
  return (
    <View style={[styles.iconFrame, focused && styles.iconFocused]}>
      <TelegramGlyph
        d={glyph.d}
        fillRule={glyph.fillRule}
        color={color}
        size={24}
      />
    </View>
  );
}

function getTabIcon(routeName: keyof MainTabParamList, color: string, focused: boolean) {
  switch (routeName) {
    case 'Contacts':
      return <TabTelegramIcon tab="contacts" color={color} focused={focused} />;
    case 'Settings':
      return <TabTelegramIcon tab="settings" color={color} focused={focused} />;
    case 'Chats':
    default:
      return <TabTelegramIcon tab="chats" color={color} focused={focused} />;
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
}: {
  routeName: keyof MainTabParamList;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.tabButton, focused && styles.tabButtonActive]}>
      <View style={styles.tabButtonContent}>
        {getTabIcon(routeName, color, focused)}
        <Text style={[styles.customLabel, { color }]} numberOfLines={1}>
          {getTabLabel(routeName)}
        </Text>
      </View>
    </View>
  );
}

function GroupChatIcon() {
  const g = TELEGRAM_PROFILE_GLYPHS.groupAddMember;
  return (
    <View style={styles.quickActionIcon}>
      <TelegramGlyph d={g.d} fillRule={g.fillRule} color={colors.accent} size={26} />
    </View>
  );
}

function ChannelIcon() {
  return (
    <View style={styles.quickActionIcon}>
      <MaterialCommunityIcons
        name="bullhorn-outline"
        color={colors.accent}
        size={25}
      />
    </View>
  );
}

function ChatsQuickActionsMenu({
  visible,
  onClose,
  onCreateGroup,
  onCreateChannel,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  bottomInset: number;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.menuRoot}>
        <Pressable style={styles.menuBackdrop} onPress={onClose} />
        <View style={[styles.quickMenuCard, { marginBottom: 86 + bottomInset }]}>
          <Pressable
            onPress={onCreateGroup}
            style={({ pressed }) => [
              styles.quickMenuButton,
              pressed && styles.quickMenuButtonPressed,
            ]}
          >
            <View style={styles.quickMenuIconWrap}>
              <GroupChatIcon />
            </View>
            <View style={styles.quickMenuTextWrap}>
              <Text style={styles.quickMenuTitle}>Создать группу</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onCreateChannel}
            style={({ pressed }) => [
              styles.quickMenuButton,
              pressed && styles.quickMenuButtonPressed,
            ]}
          >
            <View style={styles.quickMenuIconWrap}>
              <ChannelIcon />
            </View>
            <View style={styles.quickMenuTextWrap}>
              <Text style={styles.quickMenuTitle}>Создать канал</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type ChatsTabButtonProps = BottomTabBarButtonProps & {
  onOpenQuickMenu: () => void;
  onBeforePress: () => void;
  ignoreNextPressRef: React.MutableRefObject<boolean>;
};

function ChatsTabButton({
  accessibilityState,
  accessibilityLabel,
  children,
  onLongPress,
  onOpenQuickMenu,
  onPress,
  onBeforePress,
  testID,
  style,
  ignoreNextPressRef,
}: ChatsTabButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      testID={testID}
      onPress={(event) => {
        if (ignoreNextPressRef.current) {
          ignoreNextPressRef.current = false;
          return;
        }
        onBeforePress();
        onPress?.(event);
      }}
      onLongPress={(event) => {
        ignoreNextPressRef.current = true;
        onOpenQuickMenu();
        onLongPress?.(event);
      }}
      delayLongPress={220}
      style={style}
    >
      {children}
    </Pressable>
  );
}

export function MainTabs() {
  const navigation = useNavigation<NavigationProp<MainTabParamList>>();
  const insets = useSafeAreaInsets();
  const [isChatsQuickMenuVisible, setIsChatsQuickMenuVisible] = React.useState(false);
  const ignoreNextChatsPressRef = React.useRef(false);
  const tabBarStyle = React.useMemo(
    () => [
      styles.tabBar,
      {
        height: 57 + Math.max(insets.bottom, 0),
        paddingBottom: Math.max(insets.bottom, 5),
      },
    ],
    [insets.bottom]
  );

  const closeChatsQuickMenu = React.useCallback(() => {
    setIsChatsQuickMenuVisible(false);
  }, []);

  const openChatsQuickMenu = React.useCallback(() => {
    setIsChatsQuickMenuVisible(true);
  }, []);

  const handleCreateGroup = React.useCallback(() => {
    closeChatsQuickMenu();
    navigation.navigate('Chats', { screen: 'CreateGroupChat' });
  }, [closeChatsQuickMenu, navigation]);

  const handleCreateChannel = React.useCallback(() => {
    closeChatsQuickMenu();
    navigation.navigate('Chats', { screen: 'CreateChannel' });
  }, [closeChatsQuickMenu, navigation]);

  return (
    <>
      <Tab.Navigator
        id={undefined as never}
        screenListeners={{
          tabPress: closeChatsQuickMenu,
        }}
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.toolbar,
          },
          headerShadowVisible: false,
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            color: colors.textPrimary,
            fontWeight: '700',
          },
          tabBarShowLabel: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: '#273142',
          tabBarItemStyle: styles.nativeTabItem,
          tabBarStyle,
          tabBarIcon: ({ color, focused }) => (
            <TabBarItem routeName={route.name} color={color} focused={focused} />
          ),
        })}
      >
        <Tab.Screen
          name="Contacts"
          component={ContactsScreen}
          options={{ title: 'Контакты' }}
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
              focusedRoute === 'ChannelAdmin';

            return {
              title: 'Чаты',
              headerShown: false,
              tabBarStyle: shouldHideTabBar ? styles.hiddenTabBar : tabBarStyle,
              tabBarButton: (props) => (
                <ChatsTabButton
                  {...props}
                  ignoreNextPressRef={ignoreNextChatsPressRef}
                  onBeforePress={closeChatsQuickMenu}
                  onOpenQuickMenu={openChatsQuickMenu}
                />
              ),
            };
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsStack}
          options={({ route }) => {
            const focused = getFocusedRouteNameFromRoute(route) ?? 'SettingsMain';
            const hide = focused === 'MiniApp' || focused === 'Services';
            return {
              title: 'Настройки',
              headerShown: false,
              tabBarStyle: hide ? styles.hiddenTabBar : tabBarStyle,
            };
          }}
        />
      </Tab.Navigator>

      <ChatsQuickActionsMenu
        visible={isChatsQuickMenuVisible}
        onClose={closeChatsQuickMenu}
        onCreateGroup={handleCreateGroup}
        onCreateChannel={handleCreateChannel}
        bottomInset={Math.max(insets.bottom, 0)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 57,
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.inputBackgroundSolid,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
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
  menuRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.12)',
  },
  quickMenuCard: {
    width: 228,
    borderRadius: 14,
    backgroundColor: colors.inputBackgroundSolid,
    shadowColor: '#1F2937',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  quickMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 14,
    gap: 12,
  },
  quickMenuButtonPressed: {
    opacity: 0.92,
  },
  quickMenuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
  quickActionIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickMenuTextWrap: {
    flex: 1,
  },
  quickMenuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
});

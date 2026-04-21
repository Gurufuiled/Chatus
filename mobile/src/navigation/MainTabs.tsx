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
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChatsStack } from './ChatsStack';
import { SettingsStack } from './SettingsStack';
import { ContactsScreen } from '../screens';
import type { MainTabParamList } from './types';
import { colors, withAlpha } from '../theme/colors';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_TAB_GLYPHS } from '../icons/telegram/tabPaths';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';

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

function QuickActionIconTile({
  tint,
  children,
}: {
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.quickMenuIconTile, { backgroundColor: withAlpha(tint, 0.14) }]}>
      <View style={[styles.quickMenuIconInner, { backgroundColor: tint }]}>{children}</View>
    </View>
  );
}

function GroupChatIcon() {
  const g = TELEGRAM_PROFILE_GLYPHS.groupAddMember;
  return <TelegramGlyph d={g.d} fillRule={g.fillRule} color="#FFFFFF" size={22} />;
}

function ChannelIcon() {
  return <MaterialCommunityIcons name="bullhorn" color="#FFFFFF" size={20} />;
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
  const [mounted, setMounted] = React.useState(visible);
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, progress]);

  if (!mounted) return null;

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const cardTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const cardOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.4, 1],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <View style={styles.menuRoot}>
        <Animated.View style={[styles.menuBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.quickMenuCard,
            {
              marginBottom: 86 + bottomInset,
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslate }, { scale: cardScale }],
            },
          ]}
        >
          <Pressable
            onPress={onCreateGroup}
            android_ripple={{ color: withAlpha(colors.accent, 0.08) }}
            style={({ pressed }) => [
              styles.quickMenuButton,
              pressed && styles.quickMenuButtonPressed,
            ]}
          >
            <QuickActionIconTile tint="#8A6DF1">
              <GroupChatIcon />
            </QuickActionIconTile>
            <View style={styles.quickMenuTextWrap}>
              <Text style={styles.quickMenuTitle}>Создать группу</Text>
              <Text style={styles.quickMenuSubtitle}>До 200 000 участников</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.quickMenuSeparator} />

          <Pressable
            onPress={onCreateChannel}
            android_ripple={{ color: withAlpha(colors.accent, 0.08) }}
            style={({ pressed }) => [
              styles.quickMenuButton,
              pressed && styles.quickMenuButtonPressed,
            ]}
          >
            <QuickActionIconTile tint={colors.accent}>
              <ChannelIcon />
            </QuickActionIconTile>
            <View style={styles.quickMenuTextWrap}>
              <Text style={styles.quickMenuTitle}>Создать канал</Text>
              <Text style={styles.quickMenuSubtitle}>Публикации для аудитории</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>
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
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  quickMenuCard: {
    width: 280,
    borderRadius: 18,
    paddingVertical: 6,
    backgroundColor: colors.inputBackgroundSolid,
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  quickMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  quickMenuButtonPressed: {
    backgroundColor: withAlpha('#0F172A', 0.04),
  },
  quickMenuIconTile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickMenuIconInner: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  quickMenuSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginHorizontal: 18,
    marginVertical: 2,
  },
  quickMenuTextWrap: {
    flex: 1,
  },
  quickMenuTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  quickMenuSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 16,
  },
});

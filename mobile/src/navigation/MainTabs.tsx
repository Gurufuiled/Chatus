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
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatsStack } from './ChatsStack';
import { ContactsScreen, SettingsScreen } from '../screens';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconProps = {
  color: string;
  focused: boolean;
};

function ContactsIcon({ color, focused }: IconProps) {
  return (
    <View style={[styles.iconFrame, focused && styles.iconFocused]}>
      <View style={[styles.contactHead, { borderColor: color }]} />
      <View style={[styles.contactBody, { borderColor: color }]} />
    </View>
  );
}

function ChatsIcon({ color, focused }: IconProps) {
  return (
    <View style={[styles.iconFrame, focused && styles.iconFocused]}>
      <View style={[styles.chatBubbleRear, { borderColor: color }]} />
      <View style={[styles.chatBubbleMain, { borderColor: color }]} />
      <View style={styles.chatDotsRow}>
        <View style={[styles.chatDot, { backgroundColor: color }]} />
        <View style={[styles.chatDot, { backgroundColor: color }]} />
        <View style={[styles.chatDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SettingsIcon({ color, focused }: IconProps) {
  return (
    <View style={[styles.iconFrame, focused && styles.iconFocused]}>
      <View style={[styles.settingsRing, { borderColor: color }]} />
      <View style={[styles.settingsCenter, { backgroundColor: color }]} />
      <View style={[styles.settingsBarVertical, { backgroundColor: color }]} />
      <View style={[styles.settingsBarHorizontal, { backgroundColor: color }]} />
      <View style={[styles.settingsBarDiagLeft, { backgroundColor: color }]} />
      <View style={[styles.settingsBarDiagRight, { backgroundColor: color }]} />
      <View style={styles.settingsCutout}>
        <View style={[styles.settingsCutoutInner, { borderColor: color }]} />
      </View>
    </View>
  );
}

function getTabIcon(routeName: keyof MainTabParamList, color: string, focused: boolean) {
  switch (routeName) {
    case 'Contacts':
      return <ContactsIcon color={color} focused={focused} />;
    case 'Settings':
      return <SettingsIcon color={color} focused={focused} />;
    case 'Chats':
    default:
      return <ChatsIcon color={color} focused={focused} />;
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
      {focused ? <View style={styles.activeGlow} /> : null}
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
  return (
    <View style={styles.quickActionIcon}>
      <View style={styles.groupBackHead} />
      <View style={styles.groupBackBody} />
      <View style={styles.groupFrontHead} />
      <View style={styles.groupFrontBody} />
    </View>
  );
}

function ChatsQuickActionsMenu({
  visible,
  onClose,
  onCreateGroup,
}: {
  visible: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.menuRoot}>
        <Pressable style={styles.menuBackdrop} onPress={onClose} />
        <View style={styles.quickMenuCard}>
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
              <Text style={styles.quickMenuTitle}>Создать групповой чат</Text>
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
  const [isChatsQuickMenuVisible, setIsChatsQuickMenuVisible] = React.useState(false);
  const ignoreNextChatsPressRef = React.useRef(false);

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
            backgroundColor: '#EAF3FF',
          },
          headerShadowVisible: false,
          headerTintColor: '#111827',
          headerTitleStyle: {
            color: '#111827',
            fontWeight: '700',
          },
          tabBarShowLabel: false,
          tabBarActiveTintColor: '#4D8DFF',
          tabBarInactiveTintColor: '#273142',
          tabBarItemStyle: styles.nativeTabItem,
          tabBarStyle: styles.tabBar,
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
              focusedRoute === 'CreateGroupChat' ||
              focusedRoute === 'GroupProfile';

            return {
              title: 'Чаты',
              headerShown: false,
              tabBarStyle: shouldHideTabBar ? styles.hiddenTabBar : styles.tabBar,
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
          component={SettingsScreen}
          options={{ title: 'Настройки' }}
        />
      </Tab.Navigator>

      <ChatsQuickActionsMenu
        visible={isChatsQuickMenuVisible}
        onClose={closeChatsQuickMenu}
        onCreateGroup={handleCreateGroup}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 34,
    right: 34,
    bottom: 10,
    height: 54,
    paddingTop: 5,
    paddingBottom: 5,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E3E8EF',
    borderRadius: 27,
    elevation: 8,
    shadowColor: '#AEB8C5',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  hiddenTabBar: {
    display: 'none',
  },
  nativeTabItem: {
    paddingVertical: 0,
  },
  tabButton: {
    height: 40,
    minWidth: 88,
    paddingHorizontal: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabButtonActive: {
    backgroundColor: '#EAF3FF',
    shadowColor: '#4D8DFF',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  activeGlow: {
    position: 'absolute',
    top: -7,
    width: 54,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(77, 141, 255, 0.08)',
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
    width: 70,
  },
  iconFrame: {
    width: 24,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFocused: {
    transform: [{ scale: 1.03 }],
  },
  contactHead: {
    position: 'absolute',
    top: 1,
    width: 8,
    height: 8,
    borderWidth: 1.9,
    borderRadius: 999,
  },
  contactBody: {
    position: 'absolute',
    top: 8,
    width: 14,
    height: 8,
    borderWidth: 1.9,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  chatBubbleRear: {
    position: 'absolute',
    right: 1,
    top: 5,
    width: 9,
    height: 7,
    borderRadius: 4.5,
    borderWidth: 1.6,
    backgroundColor: 'transparent',
    opacity: 0.85,
  },
  chatBubbleMain: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: 13,
    height: 10,
    borderRadius: 5.5,
    borderWidth: 1.7,
    backgroundColor: 'transparent',
  },
  chatDotsRow: {
    position: 'absolute',
    top: 6,
    left: 3,
    width: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chatDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 999,
  },
  settingsRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderWidth: 1.8,
    borderRadius: 999,
  },
  settingsCenter: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 999,
  },
  settingsBarVertical: {
    position: 'absolute',
    width: 2,
    height: 16,
    borderRadius: 2,
  },
  settingsBarHorizontal: {
    position: 'absolute',
    width: 16,
    height: 2,
    borderRadius: 2,
  },
  settingsBarDiagLeft: {
    position: 'absolute',
    width: 15,
    height: 2,
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }],
  },
  settingsBarDiagRight: {
    position: 'absolute',
    width: 15,
    height: 2,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  settingsCutout: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsCutoutInner: {
    width: 6,
    height: 6,
    borderWidth: 1.4,
    borderRadius: 999,
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
    marginBottom: 86,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#EAF3FF',
  },
  quickActionIcon: {
    width: 22,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBackHead: {
    position: 'absolute',
    left: 2,
    top: 1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.6,
    borderColor: '#7AA9FF',
    backgroundColor: 'transparent',
  },
  groupBackBody: {
    position: 'absolute',
    left: 0,
    top: 8,
    width: 11,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.6,
    borderColor: '#7AA9FF',
    backgroundColor: 'transparent',
  },
  groupFrontHead: {
    position: 'absolute',
    right: 3,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.8,
    borderColor: '#4D8DFF',
    backgroundColor: 'transparent',
  },
  groupFrontBody: {
    position: 'absolute',
    right: 1,
    top: 8,
    width: 12,
    height: 8,
    borderRadius: 4.5,
    borderWidth: 1.8,
    borderColor: '#4D8DFF',
    backgroundColor: 'transparent',
  },
  quickMenuTextWrap: {
    flex: 1,
  },
  quickMenuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 20,
  },
});

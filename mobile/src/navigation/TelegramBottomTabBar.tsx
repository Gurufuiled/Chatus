import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { chatStore } from '../stores/chatStore';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_TAB_GLYPHS } from '../icons/telegram/tabPaths';
import type { MainTabParamList } from './types';

const TAB_BAR_HEIGHT = 64;
const HORIZONTAL_INSET = 8;

type TabKey = 'contacts' | 'chats' | 'settings';

function getTabKey(routeName: keyof MainTabParamList): TabKey {
  if (routeName === 'Contacts') return 'contacts';
  if (routeName === 'Settings') return 'settings';
  return 'chats';
}

function getTabLabel(routeName: keyof MainTabParamList): string {
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

function getTabBarPalette(resolvedScheme: 'light' | 'dark', accent: string) {
  if (resolvedScheme === 'dark') {
    return {
      blurTint: 'dark' as const,
      barColor: 'rgba(28, 36, 47, 0.78)',
      selectionBg: '#2F3949',
      activeColor: accent,
      inactiveColor: '#FFFFFF',
      badgeBorder: '#1C242F',
      shadowOpacity: 0.35,
    };
  }
  return {
    blurTint: 'light' as const,
    barColor: 'rgba(255, 255, 255, 0.82)',
    selectionBg: '#E8EDF2',
    activeColor: accent,
    inactiveColor: '#8E8E93',
    badgeBorder: '#FFFFFF',
    shadowOpacity: 0.12,
  };
}

type TabBarItemProps = {
  routeName: keyof MainTabParamList;
  focused: boolean;
  palette: ReturnType<typeof getTabBarPalette>;
  onPress: () => void;
  onLongPress: () => void;
};

function TabBarItem({ routeName, focused, palette, onPress, onLongPress }: TabBarItemProps) {
  const tab = getTabKey(routeName);
  const glyphs = TELEGRAM_TAB_GLYPHS[tab];
  const glyph = focused ? glyphs.active : glyphs.inactive;
  const labelColor = focused ? palette.activeColor : palette.inactiveColor;

  const chatusUnread = chatStore((state) =>
    state.chats.reduce((acc, chat) => acc + Math.max(0, chat.unread_count ?? 0), 0),
  );
  const telegramUnread = telegramAccountStore((state) =>
    state.authStatus === 'ready'
      ? state.dialogs.reduce((acc, row) => acc + Math.max(0, row.unreadCount ?? 0), 0)
      : 0,
  );
  const totalUnread = routeName === 'Chats' ? chatusUnread + telegramUnread : 0;
  const showBadge = routeName === 'Chats' && totalUnread > 0;
  const badgeLabel = totalUnread > 999 ? '999+' : String(totalUnread);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={getTabLabel(routeName)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabPressable}
    >
      <View style={[styles.tabItem, focused && { backgroundColor: palette.selectionBg }]}>
        <View style={styles.iconSlot}>
          <TelegramGlyph
            d={glyph.d}
            fillRule={glyph.fillRule}
            color={labelColor}
            size={24}
          />
          {showBadge ? (
            <View style={[styles.badge, { backgroundColor: palette.activeColor, borderColor: palette.badgeBorder }]}>
              <Text style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {getTabLabel(routeName)}
        </Text>
      </View>
    </Pressable>
  );
}

export function TelegramBottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors: themeColors, resolvedScheme } = useTheme();
  const palette = React.useMemo(
    () => getTabBarPalette(resolvedScheme, themeColors.accent),
    [resolvedScheme, themeColors.accent],
  );

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options;
  const focusedTabBarStyle = focusedOptions?.tabBarStyle;
  if (
    focusedTabBarStyle &&
    typeof focusedTabBarStyle === 'object' &&
    'display' in focusedTabBarStyle &&
    focusedTabBarStyle.display === 'none'
  ) {
    return null;
  }

  const bottomGap = Math.max(insets.bottom, Platform.OS === 'ios' ? 4 : 8);

  return (
    <View style={[styles.host, { paddingBottom: bottomGap }]} pointerEvents="box-none">
      <View
        style={[
          styles.barShadow,
          {
            shadowOpacity: palette.shadowOpacity,
          },
        ]}
      >
        <BlurView
          intensity={resolvedScheme === 'dark' ? 72 : 88}
          tint={palette.blurTint}
          blurMethod="dimezisBlurView"
          style={[styles.bar, { backgroundColor: palette.barColor }]}
        >
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const routeName = route.name as keyof MainTabParamList;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <TabBarItem
                key={route.key}
                routeName={routeName}
                focused={focused}
                palette={palette}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: HORIZONTAL_INSET,
  },
  barShadow: {
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: TAB_BAR_HEIGHT,
    borderRadius: 32,
    overflow: 'hidden',
    paddingHorizontal: 4,
  },
  tabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAB_BAR_HEIGHT,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 72,
    gap: 3,
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});

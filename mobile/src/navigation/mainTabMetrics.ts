import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/** Height of the floating bottom tab bar (`TelegramBottomTabBar`). */
export const MAIN_TAB_BAR_HEIGHT = 49;

/** Extra lift above the physical screen bottom (viewport height fraction). */
export const MAIN_TAB_BAR_BOTTOM_LIFT_RATIO = 0.02;
export const MAIN_TAB_BAR_BOTTOM_LIFT = `${MAIN_TAB_BAR_BOTTOM_LIFT_RATIO * 100}%`;

export function getMainTabBarBottomGap(insets: EdgeInsets): number {
  return Math.max(insets.bottom, Platform.OS === 'ios' ? 4 : 8);
}

/** Pixel offset from screen bottom to the top edge of the tab bar. */
export function getMainTabBarTopFromBottom(insets: EdgeInsets, screenHeight: number): number {
  return (
    screenHeight * MAIN_TAB_BAR_BOTTOM_LIFT_RATIO +
    getMainTabBarBottomGap(insets) +
    MAIN_TAB_BAR_HEIGHT
  );
}

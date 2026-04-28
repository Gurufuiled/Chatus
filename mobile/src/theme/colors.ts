/**
 * Theme colors and typography for messenger UI (Telegram Android–inspired defaults).
 * @deprecated For theme-aware UI use `useTheme().colors` from ThemeContext. This export is the light palette for gradual migration.
 */

import { lightPalette, type ThemeColors } from './palettes';

export type { ThemeColors };

export { withAlpha, bubbleRadius } from './stylePrimitives';

/** Light palette (static); use `useTheme().colors` when possible. */
export const colors: ThemeColors = lightPalette;

export const typography = {
  messageText: 16,
  messageTextLineHeight: 22,
  timeStatus: 12,
  dialogTitle: 17,
  dialogPreview: 16,
  dialogTime: 14,
};

export const MIN_TAP_TARGET = 44;

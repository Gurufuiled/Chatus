/**
 * Semantic color tokens shared by light and dark palettes (same keys).
 */

export type ThemeColors = {
  textPrimary: string;
  textSecondary: string;
  textSecondaryMuted: string;
  placeholder: string;
  accent: string;
  link: string;
  disabled: string;
  separator: string;
  chatBackground: string;
  inputBackground: string;
  inputBackgroundSolid: string;
  buttonBackground: string;
  header: string;
  toolbar: string;
  bubbleMe: string;
  bubbleOther: string;
  bubbleOtherBorder: string;
  placeholderBg: string;
  iconMuted: string;
  composerBorder: string;
  composerSurface: string;
  rowPressed: string;
};

export type AppAppearancePreference = 'system' | 'light' | 'dark';

export type ResolvedColorScheme = 'light' | 'dark';

/** Telegram Android–inspired light defaults (legacy `colors` export). */
export const lightPalette: ThemeColors = {
  textPrimary: '#1A1D21',
  textSecondary: '#5C6370',
  textSecondaryMuted: 'rgba(0,0,0,0.42)',
  placeholder: '#999999',
  accent: '#3390EC',
  link: '#2B75C6',
  disabled: '#cccccc',
  separator: '#E3E4E8',
  chatBackground: '#E7EBF0',
  inputBackground: '#F4F4F5',
  inputBackgroundSolid: '#FFFFFF',
  buttonBackground: '#E7EBF0',
  header: '#F7F7F8',
  toolbar: '#F7F7F8',
  bubbleMe: '#3390EC',
  bubbleOther: '#FFFFFF',
  bubbleOtherBorder: '#DADCE0',
  placeholderBg: '#E0E0E0',
  iconMuted: '#9EA7B3',
  composerBorder: '#DADADA',
  composerSurface: '#FFFFFF',
  rowPressed: '#F5F6F7',
};

/** Telegram-like dark surfaces; accent kept recognizable. */
export const darkPalette: ThemeColors = {
  textPrimary: '#F5F5F7',
  textSecondary: '#9AA0A6',
  textSecondaryMuted: 'rgba(255,255,255,0.72)',
  placeholder: '#6D7175',
  accent: '#5CA8FF',
  link: '#6CB0F5',
  disabled: '#5C5C5C',
  separator: 'rgba(255,255,255,0.10)',
  chatBackground: '#0E1621',
  inputBackground: '#1A2330',
  inputBackgroundSolid: '#1E2A35',
  buttonBackground: '#1E2A35',
  header: '#1A2330',
  toolbar: '#1A2330',
  bubbleMe: '#2B7FD6',
  bubbleOther: '#2B2C2E',
  bubbleOtherBorder: 'rgba(255,255,255,0.12)',
  placeholderBg: '#3A3A3C',
  iconMuted: '#8E95A0',
  composerBorder: 'rgba(255,255,255,0.14)',
  composerSurface: '#1E2A35',
  rowPressed: 'rgba(255,255,255,0.06)',
};

export function getPaletteForScheme(scheme: ResolvedColorScheme): ThemeColors {
  return scheme === 'dark' ? darkPalette : lightPalette;
}

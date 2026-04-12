/**
 * Theme colors and typography for messenger UI (Telegram Android–inspired defaults).
 */

/**
 * Converts a `#RRGGBB` theme hex to `rgba(r,g,b,a)` so accent overlays stay in sync with `colors.accent`.
 */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    return hex;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const colors = {
  textPrimary: '#222222',
  textSecondary: '#8E8E93',
  textSecondaryMuted: 'rgba(255,255,255,0.82)',
  placeholder: '#999999',
  /** Primary Telegram blue (Android). */
  accent: '#3390EC',
  link: '#2B75C6',
  disabled: '#cccccc',
  separator: '#E3E4E8',
  chatBackground: '#E7EBF0',
  inputBackground: '#F4F4F5',
  inputBackgroundSolid: '#FFFFFF',
  buttonBackground: '#E7EBF0',
  /** Action bar / app bar surface. */
  header: '#F7F7F8',
  toolbar: '#F7F7F8',
  bubbleMe: '#3390EC',
  /** Incoming bubble fill (pattern shows through via border). */
  bubbleOther: '#FFFFFF',
  bubbleOtherBorder: '#DADCE0',
  placeholderBg: '#E0E0E0',
  /** Muted icons in composer and lists. */
  iconMuted: '#9EA7B3',
  composerBorder: '#DADADA',
  composerSurface: '#FFFFFF',
  rowPressed: '#F5F6F7',
};

export const typography = {
  messageText: 16,
  messageTextLineHeight: 22,
  timeStatus: 12,
  dialogTitle: 17,
  dialogPreview: 16,
  dialogTime: 14,
};

export const MIN_TAP_TARGET = 44;

/** Corner radii loosely matching Telegram asymmetric bubbles. */
export const bubbleRadius = {
  mine: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  other: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
};

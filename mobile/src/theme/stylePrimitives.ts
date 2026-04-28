/**
 * Layout primitives and color helpers without coupling to the semantic `colors` palette export.
 * Imported by StyleSheet factories to avoid circular deps with `colors.ts` in release/Hermes.
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

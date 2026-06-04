import { Platform } from 'react-native';

/**
 * Unified max bubble width for Chatus + Telegram on Android OEM shells.
 * Slightly wider than legacy Chatus 82% / Telegram 88% split to reduce clipping variance.
 */
export const CHAT_BUBBLE_MAX_WIDTH_PCT = Platform.OS === 'android' ? '86%' : '82%';

/** Telegram iOS keeps ~88%; Android aligned with Chatus OEM-safe width. */
export const TELEGRAM_CHAT_BUBBLE_MAX_WIDTH_PCT = Platform.OS === 'android' ? '86%' : '88%';

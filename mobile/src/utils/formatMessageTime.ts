import { NativeModules, Platform } from 'react-native';
import { formatMessageTimeWithHour12 } from './formatMessageTimeCore';

export { formatMessageTimeWithHour12 } from './formatMessageTimeCore';

type TdlibNativeModule = {
  getUses24HourClock?: () => Promise<boolean>;
};

/** `hour12` for `toLocaleTimeString`; `null` until Android native preference is loaded. */
let cachedHour12: boolean | null = null;
let androidPreferencePromise: Promise<void> | null = null;

function readIntlHour12(): boolean | undefined {
  try {
    const hour12 = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
    }).resolvedOptions().hour12;
    return typeof hour12 === 'boolean' ? hour12 : undefined;
  } catch {
    return undefined;
  }
}

function resolveHour12Sync(): boolean {
  if (cachedHour12 !== null) {
    return cachedHour12;
  }
  const intl = readIntlHour12();
  if (intl !== undefined) {
    return intl;
  }
  // Unknown: follow locale 12h default (Intl) or 12h as last resort — avoid wrong 24h flash.
  return true;
}

async function loadAndroidHourPreference(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const mod = NativeModules.Tdlib as TdlibNativeModule | undefined;
  if (!mod?.getUses24HourClock) {
    const intl = readIntlHour12();
    if (intl !== undefined) {
      cachedHour12 = intl;
    }
    return;
  }
  try {
    const uses24Hour = await mod.getUses24HourClock();
    cachedHour12 = !uses24Hour;
  } catch {
    const intl = readIntlHour12();
    if (intl !== undefined) {
      cachedHour12 = intl;
    }
  }
}

/** Call once at app start (e.g. root layout) so first chat paint uses system 24h on Android. */
export function prefetchMessageTimeFormat(): Promise<void> {
  if (Platform.OS !== 'android') {
    return Promise.resolve();
  }
  if (!androidPreferencePromise) {
    androidPreferencePromise = loadAndroidHourPreference();
  }
  return androidPreferencePromise;
}

/** Message / dialog list time (e.g. `14:35` or `2:35 PM`). */
export function formatMessageTime(timestamp: number): string {
  void prefetchMessageTimeFormat();
  return formatMessageTimeWithHour12(timestamp, resolveHour12Sync());
}

/** @deprecated Use {@link formatMessageTime}. */
export const formatTime = formatMessageTime;

/**
 * Stable key for matching voice playback state across URI variants
 * (https vs file:// cache, query strings, etc.).
 */
export function normalizeVoicePlaybackKey(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return '';

  const withoutFragment = trimmed.split('#')[0] ?? trimmed;
  const withoutQuery = withoutFragment.split('?')[0] ?? withoutFragment;

  try {
    if (/^https?:\/\//i.test(withoutQuery)) {
      const url = new URL(withoutQuery);
      const pathname = url.pathname.replace(/\/+/g, '/');
      return `${url.protocol}//${url.host}${pathname}`.toLowerCase();
    }

    if (withoutQuery.startsWith('file://')) {
      const url = new URL(withoutQuery);
      return `file://${url.pathname}`.toLowerCase();
    }
  } catch {
    // Fall through to path normalization below.
  }

  return withoutQuery.replace(/\/+/g, '/').toLowerCase();
}

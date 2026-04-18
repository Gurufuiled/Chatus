/**
 * Parse in-app channel URLs from message text (chatus://, messenger://, Expo dev URLs, etc.).
 */

export type ParsedChannelDeepLink =
  | { kind: 'slug'; slug: string }
  | { kind: 'invite'; inviteToken: string };

/**
 * Returns a parsed link if `text` is a single-line channel deep link (no extra words).
 */
export function parseChannelDeepLinkFromMessage(text: string): ParsedChannelDeepLink | null {
  const t = text.trim();
  if (!t) return null;
  if (/\s[^\s]/.test(t)) {
    return null;
  }

  const join = t.match(/join\/([^/?#\s]+)/i);
  if (join?.[1]) {
    try {
      const inviteToken = decodeURIComponent(join[1]);
      if (inviteToken.length > 0) return { kind: 'invite', inviteToken };
    } catch {
      return null;
    }
  }

  const slugMatch = t.match(/(?:^|[/:])c\/([^/?#\s]+)/i);
  if (slugMatch?.[1]) {
    try {
      const slug = decodeURIComponent(slugMatch[1]).toLowerCase();
      if (/^[a-z0-9_]+$/.test(slug)) return { kind: 'slug', slug };
    } catch {
      return null;
    }
  }

  return null;
}

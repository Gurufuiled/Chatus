/** Server emits `chatus://join/{token}` — only this scheme is an actionable join link. */
const CHATUS_SCHEME_RE = /chatus:\/\/join\/([A-Za-z0-9_-]+)/gi;

export type InviteMatch = {
  raw: string;
  token: string;
  index: number;
  length: number;
};

export function findInviteMatches(text: string): InviteMatch[] {
  const matches: InviteMatch[] = [];
  CHATUS_SCHEME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHATUS_SCHEME_RE.exec(text)) !== null) {
    if (!m[1]) continue;
    matches.push({
      raw: m[0],
      token: m[1],
      index: m.index,
      length: m[0].length,
    });
  }
  return matches;
}

export function extractInviteToken(urlOrText: string): string | null {
  const trimmed = urlOrText.trim();
  if (!trimmed) return null;
  const matches = findInviteMatches(trimmed);
  const first = matches[0];
  if (!first || first.index !== 0) return null;
  return first.token;
}

/** True when the message is essentially just an invite link (Telegram card case). */
export function isInviteOnlyMessage(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const trimmed = text.trim();
  const matches = findInviteMatches(trimmed);
  const first = matches[0];
  if (!first || first.index !== 0) return false;
  return first.length === trimmed.length;
}

const CHANNEL_LINK_SCHEME = 'chatus';

/** Public link: chatus://c/{slug} */
export function buildChannelSlugDeepLink(slug: string): string {
  const s = slug.trim().toLowerCase();
  return `${CHANNEL_LINK_SCHEME}://c/${encodeURIComponent(s)}`;
}

/** Invite link: chatus://join/{invite_token} */
export function buildChannelInviteDeepLink(inviteToken: string): string {
  return `${CHANNEL_LINK_SCHEME}://join/${encodeURIComponent(inviteToken.trim())}`;
}

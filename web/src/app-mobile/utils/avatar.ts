import { resolveMediaUrl } from '@/services/mediaService';

const AVATAR_COLORS = ['#5B8DEF', '#53B7A8', '#F2994A', '#BB6BD9', '#EB5757', '#2D9CDB'];

export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function resolveAvatarSrc(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return resolveMediaUrl(url);
}

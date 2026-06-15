import type { AuthUser } from '@/types/auth';

export function getUserDisplayName(user: AuthUser): string {
  return user.display_name?.trim() || user.username?.trim() || 'Unknown';
}

export function getUserSubtitle(user: AuthUser): string {
  if (user.handle) return `@${user.handle}`;
  if (user.username) return user.username;
  return 'Контакт';
}

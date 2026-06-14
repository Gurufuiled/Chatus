import type { AuthUser } from '@/types/auth';

const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function getDisplayName(user: Pick<AuthUser, 'display_name' | 'last_name' | 'username' | 'handle'>): string {
  const parts = [user.display_name, user.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return user.username ?? user.handle ?? 'User';
}

export function formatLastSeen(user: Pick<AuthUser, 'is_online' | 'last_seen'>): string {
  if (user.is_online) return 'в сети';
  if (!user.last_seen) return 'был(а) давно';

  const diffMs = Date.now() - user.last_seen;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'был(а) только что';
  if (minutes < 60) return `был(а) ${minutes} мин. назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `был(а) ${hours} ч. назад`;

  const date = new Date(user.last_seen);
  return `был(а) ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

export function formatBirthday(ms: number | null): string | null {
  if (!ms) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS_RU[date.getUTCMonth()]}`;
}

export function birthdayMsToInputValue(ms: number | null): string {
  if (!ms) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone;
}

export function formatUsername(handle: string | null): string | null {
  if (!handle) return null;
  return `@${handle}`;
}

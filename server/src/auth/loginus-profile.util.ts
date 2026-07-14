import type { User } from '@prisma/client';

export interface LoginusInitDataPayload {
  sub?: string;
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  avatarUrl?: string;
  avatar_url?: string;
  avatar?: string;
  phone?: string;
  phone_number?: string;
  aud?: string;
  appSlug?: string;
  time?: number;
}

export interface LoginusProfileFields {
  loginusId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
}

export interface LoginusOutboundProfile {
  sub: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export function extractLoginusId(
  payload: Pick<LoginusInitDataPayload, 'sub' | 'userId'>,
): string | null {
  return payload.sub ?? payload.userId ?? null;
}

export function profileFieldsFromInitPayload(
  payload: LoginusInitDataPayload,
  profileOverride?: Partial<LoginusProfileFields>,
): LoginusProfileFields {
  const loginusId = extractLoginusId(payload) ?? profileOverride?.loginusId ?? '';
  const fromJwt = {
    email: payload.email ?? null,
    firstName: payload.firstName ?? payload.first_name ?? null,
    lastName: payload.lastName ?? payload.last_name ?? null,
    avatarUrl:
      payload.avatarUrl ?? payload.avatar_url ?? payload.avatar ?? null,
    phone: payload.phone ?? payload.phone_number ?? null,
  };
  return {
    loginusId,
    email: fromJwt.email ?? profileOverride?.email ?? null,
    firstName: fromJwt.firstName ?? profileOverride?.firstName ?? null,
    lastName: fromJwt.lastName ?? profileOverride?.lastName ?? null,
    avatarUrl: fromJwt.avatarUrl ?? profileOverride?.avatarUrl ?? null,
    phone: fromJwt.phone ?? profileOverride?.phone ?? null,
  };
}

export function normalizeLoginusPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = phone.replace(/\D/g, '');
  if (raw.length === 0) return null;
  if (raw.length === 11 && raw.startsWith('8')) return `+7${raw.slice(1)}`;
  if (raw.length === 11 && raw.startsWith('7')) return `+${raw}`;
  if (raw.length === 10 && raw.startsWith('9')) return `+7${raw}`;
  return `+${raw}`;
}

/** ChatUs-owned: UUID upload or content-addressed Loginus cache `avatar-<sha256-32>.ext`. */
const CHATUS_UPLOAD_PATH_RE =
  /^\/uploads\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|avatar-[0-9a-f]{32})\.[a-z0-9]+$/i;

export function getLoginusOrigin(): string {
  return (
    process.env.LOGINUS_BASE_URL?.trim() ||
    process.env.LOGINUS_ORIGIN?.trim() ||
    'https://id.startapus.com'
  ).replace(/\/$/, '');
}

export function getAllowedAvatarDownloadHosts(): Set<string> {
  const hosts = new Set<string>();
  const addHost = (raw: string) => {
    const part = raw.trim();
    if (!part) return;
    try {
      const u = part.includes('://') ? new URL(part) : new URL(`https://${part}`);
      if (u.hostname) hosts.add(u.hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  };
  addHost(process.env.LOGINUS_BASE_URL ?? '');
  addHost(process.env.LOGINUS_ORIGIN ?? '');
  for (const part of (process.env.LOGINUS_AVATAR_HOST_ALLOWLIST ?? '').split(',')) {
    addHost(part);
  }
  if (hosts.size === 0) hosts.add('id.startapus.com');
  return hosts;
}

/** Only Loginus (and explicit allowlist) hosts may be fetched server-side (SSRF guard). */
export function isAllowedAvatarDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host === '::1'
    ) {
      return false;
    }
    if (
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|100\.64\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host,
      )
    ) {
      return false;
    }
    return getAllowedAvatarDownloadHosts().has(host);
  } catch {
    return false;
  }
}

/**
 * Normalize to ChatUs `/uploads/<uuid|avatar-hash>.ext` when the URL points at our storage.
 * Returns null for Loginus paths like `/uploads/avatars/...` or foreign CDNs.
 */
export function extractChatUsUploadPath(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith('/')) return null;
  return CHATUS_UPLOAD_PATH_RE.test(pathname) ? pathname : null;
}

export function isChatUsStoredAvatarUrl(
  url: string | null | undefined,
): boolean {
  return extractChatUsUploadPath(url) != null;
}

/** @deprecated Prefer isChatUsStoredAvatarUrl — kept for outbound sync helpers. */
export function isLocalUploadAvatarUrl(url: string | null | undefined): boolean {
  return isChatUsStoredAvatarUrl(url);
}

/** Relative Loginus media paths that were incorrectly stored as ChatUs uploads. */
export function isForeignUploadAvatarPath(
  url: string | null | undefined,
): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  if (isChatUsStoredAvatarUrl(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const pathname = new URL(trimmed).pathname;
      return pathname.startsWith('/uploads/') && !CHATUS_UPLOAD_PATH_RE.test(pathname);
    } catch {
      return false;
    }
  }
  return trimmed.startsWith('/uploads/');
}

/** Turn Loginus relative `/uploads/...` into an absolute Loginus URL for download. */
export function absolutizeLoginusAvatarUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${getLoginusOrigin()}${trimmed}`;
  return null;
}

/**
 * Decide whether Loginus avatar should replace the stored one.
 * Returns absolute http(s) URL or ChatUs `/uploads/<uuid>.ext`, or undefined to skip.
 */
export function resolveInboundAvatarUrl(
  currentAvatar: string | null | undefined,
  loginusAvatar: string | null | undefined,
): string | undefined {
  if (!loginusAvatar?.trim()) return undefined;
  const absolute = absolutizeLoginusAvatarUrl(loginusAvatar);
  if (!absolute) return undefined;

  const currentPath = extractChatUsUploadPath(currentAvatar);
  const inboundPath = extractChatUsUploadPath(absolute);
  if (currentPath && inboundPath && currentPath === inboundPath) {
    return undefined;
  }
  if (inboundPath) {
    return inboundPath;
  }

  if (absolute === (currentAvatar ?? '').trim()) return undefined;
  return absolute;
}

export function getPublicOrigin(): string | null {
  const explicit =
    process.env.PUBLIC_ORIGIN?.trim() || process.env.API_PUBLIC_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const redirect = process.env.LOGINUS_REDIRECT_URI?.trim();
  if (redirect) {
    try {
      return new URL(redirect).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export function toPublicAbsoluteUrl(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.startsWith('/')) return undefined;
  const origin = getPublicOrigin();
  if (!origin) return undefined;
  return `${origin}${trimmed}`;
}

export function buildUserUpdateFromLoginusProfile(
  existing: User,
  fields: LoginusProfileFields,
): {
  data: {
    username?: string | null;
    displayName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    phone?: string | null;
  };
  changed: boolean;
} {
  const data: {
    username?: string | null;
    displayName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    phone?: string | null;
  } = {};
  let changed = false;

  if (fields.email !== undefined && fields.email !== null) {
    const nextUsername = fields.email || null;
    if (nextUsername !== (existing.username ?? null)) {
      data.username = nextUsername;
      changed = true;
    }
  }

  if (fields.firstName !== undefined && fields.firstName !== null) {
    const nextDisplayName = fields.firstName.trim() || null;
    if (nextDisplayName !== (existing.displayName ?? null)) {
      data.displayName = nextDisplayName;
      changed = true;
    }
  }

  if (fields.lastName !== undefined && fields.lastName !== null) {
    const nextLastName = fields.lastName.trim() || null;
    if (nextLastName !== (existing.lastName ?? null)) {
      data.lastName = nextLastName;
      changed = true;
    }
  }

  const avatarUpdate = resolveInboundAvatarUrl(existing.avatarUrl, fields.avatarUrl);
  if (avatarUpdate !== undefined) {
    data.avatarUrl = avatarUpdate;
    changed = true;
  }

  const phone = normalizeLoginusPhone(fields.phone);
  if (phone && !existing.phone) {
    data.phone = phone;
    changed = true;
  }

  return { data, changed };
}

export function outboundProfileFromUser(user: User): LoginusOutboundProfile | null {
  if (!user.loginusId) return null;
  const profile: LoginusOutboundProfile = { sub: user.loginusId };
  if (user.displayName?.trim()) profile.firstName = user.displayName.trim();
  if (user.lastName?.trim()) profile.lastName = user.lastName.trim();
  const avatarUrl = toPublicAbsoluteUrl(user.avatarUrl);
  if (avatarUrl) profile.avatarUrl = avatarUrl;
  return profile;
}

export function outboundProfileFingerprint(
  profile: LoginusOutboundProfile,
): string {
  return JSON.stringify({
    sub: profile.sub,
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    avatarUrl: profile.avatarUrl ?? '',
  });
}

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
  const loginusId =
    profileOverride?.loginusId ??
    extractLoginusId(payload) ??
    '';
  return {
    loginusId,
    email: profileOverride?.email ?? payload.email ?? null,
    firstName:
      profileOverride?.firstName ??
      payload.firstName ??
      payload.first_name ??
      null,
    lastName:
      profileOverride?.lastName ??
      payload.lastName ??
      payload.last_name ??
      null,
    avatarUrl:
      profileOverride?.avatarUrl ??
      payload.avatarUrl ??
      payload.avatar_url ??
      payload.avatar ??
      null,
    phone: profileOverride?.phone ?? payload.phone ?? payload.phone_number ?? null,
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

export function isLocalUploadAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('/uploads/') || url.includes('/uploads/');
}

export function resolveInboundAvatarUrl(
  currentAvatar: string | null | undefined,
  loginusAvatar: string | null | undefined,
): string | null | undefined {
  if (!loginusAvatar?.trim()) return undefined;
  const trimmed = loginusAvatar.trim();
  if (trimmed === (currentAvatar ?? null)) return undefined;
  if (isLocalUploadAvatarUrl(currentAvatar)) {
    if (!/^https?:\/\//i.test(trimmed)) return undefined;
  }
  return trimmed;
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

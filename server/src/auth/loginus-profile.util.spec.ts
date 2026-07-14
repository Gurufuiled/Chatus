import {
  absolutizeLoginusAvatarUrl,
  buildUserUpdateFromLoginusProfile,
  extractChatUsUploadPath,
  isAllowedAvatarDownloadUrl,
  isForeignUploadAvatarPath,
  outboundProfileFingerprint,
  outboundProfileFromUser,
  profileFieldsFromInitPayload,
  resolveInboundAvatarUrl,
  toPublicAbsoluteUrl,
} from './loginus-profile.util';
import type { User } from '@prisma/client';

const OWNED_AVATAR = '/uploads/550e8400-e29b-41d4-a716-446655440000.jpg';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    loginusId: 'loginus-sub-1',
    username: 'user@example.com',
    handle: null,
    displayName: 'Ivan',
    lastName: 'Petrov',
    avatarUrl: OWNED_AVATAR,
    phone: null,
    bio: null,
    birthday: null,
    isOnline: false,
    lastSeen: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('loginus-profile.util', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LOGINUS_BASE_URL = 'https://id.startapus.com';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('maps init payload fields separately for first and last name', () => {
    const fields = profileFieldsFromInitPayload({
      sub: 'sub-1',
      email: 'a@b.com',
      firstName: 'Anna',
      lastName: 'Smirnova',
      avatarUrl: 'https://cdn.example/a.png',
    });

    expect(fields).toMatchObject({
      loginusId: 'sub-1',
      email: 'a@b.com',
      firstName: 'Anna',
      lastName: 'Smirnova',
      avatarUrl: 'https://cdn.example/a.png',
    });
  });

  it('prefers signed JWT fields over optional profile body override', () => {
    const fields = profileFieldsFromInitPayload(
      {
        sub: 'sub-1',
        email: 'jwt@example.com',
        firstName: 'Anna',
        lastName: 'Smirnova',
        avatarUrl: 'https://cdn.example/jwt.png',
      },
      {
        loginusId: 'sub-1',
        email: 'body@example.com',
        firstName: 'Hacker',
        lastName: 'Evil',
        avatarUrl: 'https://cdn.example/body.png',
      },
    );

    expect(fields).toMatchObject({
      loginusId: 'sub-1',
      email: 'jwt@example.com',
      firstName: 'Anna',
      lastName: 'Smirnova',
      avatarUrl: 'https://cdn.example/jwt.png',
    });
  });

  it('fills missing JWT fields from profile body override', () => {
    const fields = profileFieldsFromInitPayload(
      { sub: 'sub-1', firstName: 'Anna' },
      { lastName: 'Smirnova', avatarUrl: 'https://cdn.example/a.png' },
    );

    expect(fields).toMatchObject({
      loginusId: 'sub-1',
      firstName: 'Anna',
      lastName: 'Smirnova',
      avatarUrl: 'https://cdn.example/a.png',
    });
  });

  it('prefers JWT sub over conflicting profile body loginusId', () => {
    const fields = profileFieldsFromInitPayload(
      { sub: 'jwt-sub' },
      { loginusId: 'body-sub', firstName: 'Anna' },
    );

    expect(fields.loginusId).toBe('jwt-sub');
    expect(fields.firstName).toBe('Anna');
  });

  it('detects ChatUs-owned UUID uploads vs Loginus /uploads/avatars paths', () => {
    expect(extractChatUsUploadPath(OWNED_AVATAR)).toBe(OWNED_AVATAR);
    expect(
      extractChatUsUploadPath(
        'https://messenger.example.com/uploads/550e8400-e29b-41d4-a716-446655440000.jpg',
      ),
    ).toBe(OWNED_AVATAR);
    expect(
      isForeignUploadAvatarPath('/uploads/avatars/1783407792651-photo.png'),
    ).toBe(true);
    expect(isForeignUploadAvatarPath(OWNED_AVATAR)).toBe(false);
  });

  it('absolutizes Loginus-relative avatar paths', () => {
    expect(absolutizeLoginusAvatarUrl('/uploads/avatars/a.png')).toBe(
      'https://id.startapus.com/uploads/avatars/a.png',
    );
  });

  it('rejects private hosts for avatar download (SSRF guard)', () => {
    expect(isAllowedAvatarDownloadUrl('https://id.startapus.com/a.png')).toBe(
      true,
    );
    expect(isAllowedAvatarDownloadUrl('http://169.254.169.254/latest')).toBe(
      false,
    );
    expect(isAllowedAvatarDownloadUrl('https://evil.example/a.png')).toBe(
      false,
    );
  });

  it('preserves ChatUs UUID avatar unless Loginus sends a different external URL', () => {
    expect(resolveInboundAvatarUrl(OWNED_AVATAR, OWNED_AVATAR)).toBeUndefined();
    expect(
      resolveInboundAvatarUrl(
        OWNED_AVATAR,
        'https://messenger.example.com/uploads/550e8400-e29b-41d4-a716-446655440000.jpg',
      ),
    ).toBeUndefined();
    expect(
      resolveInboundAvatarUrl(
        OWNED_AVATAR,
        'https://id.startapus.com/avatar.png',
      ),
    ).toBe('https://id.startapus.com/avatar.png');
    expect(resolveInboundAvatarUrl(null, '/uploads/avatars/photo.png')).toBe(
      'https://id.startapus.com/uploads/avatars/photo.png',
    );
  });

  it('skips user update when inbound profile matches existing user', () => {
    const user = makeUser();
    const { changed } = buildUserUpdateFromLoginusProfile(user, {
      loginusId: user.loginusId!,
      email: user.username,
      firstName: user.displayName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
    });
    expect(changed).toBe(false);
  });

  it('builds outbound profile with absolute avatar URL', () => {
    process.env.PUBLIC_ORIGIN = 'https://messenger.example.com';
    const user = makeUser({ avatarUrl: '/uploads/a.jpg' });
    const outbound = outboundProfileFromUser(user);
    expect(outbound).toEqual({
      sub: 'loginus-sub-1',
      firstName: 'Ivan',
      lastName: 'Petrov',
      avatarUrl: 'https://messenger.example.com/uploads/a.jpg',
    });
    expect(toPublicAbsoluteUrl('/uploads/a.jpg')).toBe(
      'https://messenger.example.com/uploads/a.jpg',
    );
  });

  it('fingerprints outbound payload for loop guard', () => {
    const profile = {
      sub: 'sub-1',
      firstName: 'Ivan',
      lastName: 'Petrov',
      avatarUrl: 'https://cdn/a.png',
    };
    expect(outboundProfileFingerprint(profile)).toBe(
      outboundProfileFingerprint({ ...profile }),
    );
    expect(outboundProfileFingerprint({ sub: 'sub-1' })).not.toBe(
      outboundProfileFingerprint(profile),
    );
  });
});

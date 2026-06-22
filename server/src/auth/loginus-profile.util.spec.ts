import {
  buildUserUpdateFromLoginusProfile,
  outboundProfileFingerprint,
  outboundProfileFromUser,
  profileFieldsFromInitPayload,
  resolveInboundAvatarUrl,
  toPublicAbsoluteUrl,
} from './loginus-profile.util';
import type { User } from '@prisma/client';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    loginusId: 'loginus-sub-1',
    username: 'user@example.com',
    handle: null,
    displayName: 'Ivan',
    lastName: 'Petrov',
    avatarUrl: '/uploads/avatar.jpg',
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

  it('preserves local upload avatar unless Loginus sends external URL', () => {
    expect(
      resolveInboundAvatarUrl('/uploads/local.jpg', '/uploads/other.jpg'),
    ).toBeUndefined();
    expect(
      resolveInboundAvatarUrl(
        '/uploads/local.jpg',
        'https://id.startapus.com/avatar.png',
      ),
    ).toBe('https://id.startapus.com/avatar.png');
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

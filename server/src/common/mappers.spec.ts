import type { User } from '@prisma/client';
import { mapUser } from './mappers';

describe('mapUser', () => {
  it('maps last_name, bio, and birthday to API shape', () => {
    const birthday = new Date(Date.UTC(1990, 4, 15, 0, 0, 0, 0));
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const updatedAt = new Date('2024-01-02T00:00:00.000Z');
    const user = {
      id: 'user-1',
      loginusId: null,
      username: 'alice',
      handle: 'alice',
      displayName: 'Alice',
      lastName: 'Tester',
      avatarUrl: null,
      phone: '+79991234567',
      bio: 'Hello from tests',
      birthday,
      isOnline: false,
      lastSeen: null,
      createdAt,
      updatedAt,
    } as User;

    const m = mapUser(user);
    expect(m.last_name).toBe('Tester');
    expect(m.bio).toBe('Hello from tests');
    expect(m.birthday).toBe(birthday.getTime());
    expect(m.display_name).toBe('Alice');
    expect(m.phone).toBe('+79991234567');
  });

  it('uses null for missing optional profile fields', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const updatedAt = new Date('2024-01-02T00:00:00.000Z');
    const user = {
      id: 'user-2',
      loginusId: null,
      username: 'bob',
      handle: 'bob',
      displayName: 'Bob',
      lastName: null,
      avatarUrl: null,
      phone: null,
      bio: null,
      birthday: null,
      isOnline: true,
      lastSeen: null,
      createdAt,
      updatedAt,
    } as User;

    const m = mapUser(user);
    expect(m.last_name).toBeNull();
    expect(m.bio).toBeNull();
    expect(m.birthday).toBeNull();
  });
});

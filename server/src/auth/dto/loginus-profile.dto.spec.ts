import { sanitizeLoginusProfileInput } from './loginus-profile.dto';

describe('sanitizeLoginusProfileInput', () => {
  it('keeps known Loginus profile fields', () => {
    const result = sanitizeLoginusProfileInput({
      sub: 'sub-1',
      firstName: 'Anna',
      lastName: 'Smirnova',
      avatarUrl: 'https://cdn.example/a.png',
    });

    expect(result).toMatchObject({
      sub: 'sub-1',
      firstName: 'Anna',
      lastName: 'Smirnova',
      avatarUrl: 'https://cdn.example/a.png',
    });
  });

  it('drops unknown fields such as updatedAt from Loginus profile', () => {
    const result = sanitizeLoginusProfileInput({
      sub: 'sub-1',
      firstName: 'Anna',
      updatedAt: '2026-06-22T10:00:00.000Z',
      locale: 'ru',
    });

    expect(result).toEqual({
      sub: 'sub-1',
      firstName: 'Anna',
    });
    expect(result).not.toHaveProperty('updatedAt');
    expect(result).not.toHaveProperty('locale');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearEmbedSession,
  loadEmbedSession,
  saveEmbedSession,
  updateStoredTokens,
} from '@/embed/authSessionStorage';
import { MOCK_USER } from '@/dev/uiPreview';

describe('authSessionStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips a valid session', () => {
    const session = {
      refresh_token: 'rt-1',
      expires_at: Date.now() + 3600_000,
      user: MOCK_USER,
    };
    saveEmbedSession(session);
    expect(loadEmbedSession()).toEqual(session);
  });

  it('returns null for invalid payload', () => {
    sessionStorage.setItem('chatus_embed_session', '{"refresh_token":""}');
    expect(loadEmbedSession()).toBeNull();
  });

  it('updates stored refresh token', () => {
    saveEmbedSession({
      refresh_token: 'rt-old',
      expires_at: 1,
      user: MOCK_USER,
    });
    updateStoredTokens(2, 'rt-new');
    expect(loadEmbedSession()?.refresh_token).toBe('rt-new');
    expect(loadEmbedSession()?.expires_at).toBe(2);
  });

  it('clears stored session', () => {
    saveEmbedSession({
      refresh_token: 'rt-1',
      expires_at: 1,
      user: MOCK_USER,
    });
    clearEmbedSession();
    expect(loadEmbedSession()).toBeNull();
  });
});

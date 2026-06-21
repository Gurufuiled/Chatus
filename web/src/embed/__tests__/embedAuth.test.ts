import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthUiStore } from '@/stores/authUiStore';
import { saveEmbedSession } from '@/embed/authSessionStorage';
import { MOCK_USER } from '@/dev/uiPreview';
import { handleAuthFailure, tryRestoreStoredSession } from '@/embed/embedAuth';
import { requestLoginusInit } from '@/embed/loginusBridge';

vi.mock('@/embed/loginusBridge', () => ({
  postToLoginusParent: vi.fn(),
  requestLoginusInit: vi.fn(),
}));

vi.mock('@/services/authService', () => ({
  refreshAccessToken: vi.fn(),
}));

import { refreshAccessToken } from '@/services/authService';

describe('embedAuth recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAuthUiStore.setState({
      embedStatus: 'waiting_init',
      accessToken: null,
      user: null,
      authError: null,
    });
    vi.mocked(refreshAccessToken).mockReset();
    vi.mocked(requestLoginusInit).mockReset();
  });

  it('restores session from stored refresh token', async () => {
    saveEmbedSession({
      refresh_token: 'rt-1',
      expires_at: Date.now() + 3600_000,
      user: MOCK_USER,
    });
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'access-1',
      refresh_token: 'rt-2',
      expires_at: Date.now() + 3600_000,
    });

    const restored = await tryRestoreStoredSession();
    expect(restored).toBe(true);
    expect(useAuthUiStore.getState().embedStatus).toBe('ready');
    expect(useAuthUiStore.getState().accessToken).toBe('access-1');
  });

  it('requests re-init instead of showing error on auth failure', () => {
    useAuthUiStore.setState({
      embedStatus: 'ready',
      accessToken: 'old',
      user: MOCK_USER,
      authError: null,
    });

    handleAuthFailure();

    expect(useAuthUiStore.getState().embedStatus).toBe('waiting_init');
    expect(useAuthUiStore.getState().accessToken).toBeNull();
    expect(useAuthUiStore.getState().user).toBeNull();
    expect(requestLoginusInit).toHaveBeenCalledTimes(1);
  });
});

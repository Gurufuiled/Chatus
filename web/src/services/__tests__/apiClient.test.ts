import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setAccessToken } from '@/services/apiClient';
import { useAuthUiStore } from '@/stores/authUiStore';
import { saveEmbedSession } from '@/embed/authSessionStorage';
import { MOCK_USER } from '@/dev/uiPreview';

describe('apiClient auth refresh', () => {
  beforeEach(() => {
    setAccessToken('expired-token');
    useAuthUiStore.setState({
      embedStatus: 'ready',
      accessToken: 'expired-token',
      user: MOCK_USER,
      authError: null,
    });
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('retries once after refreshing on 401', async () => {
    saveEmbedSession({
      refresh_token: 'rt-1',
      expires_at: Date.now() + 3600_000,
      user: MOCK_USER,
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'rt-2',
            expires_at: Date.now() + 3600_000,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    const result = await apiRequest<{ ok: boolean }>('/users/me');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useAuthUiStore.getState().accessToken).toBe('new-access');
  });

  it('throws 401 when refresh fails', async () => {
    saveEmbedSession({
      refresh_token: 'rt-1',
      expires_at: Date.now() + 3600_000,
      user: MOCK_USER,
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Invalid refresh token' }), { status: 401 }),
      );

    await expect(apiRequest('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthUiStore.getState().accessToken).toBeNull();
  });
});

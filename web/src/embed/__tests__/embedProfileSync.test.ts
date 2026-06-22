import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthUiStore } from '@/stores/authUiStore';
import { MOCK_USER } from '@/dev/uiPreview';
import { runEmbedProfileSync } from '@/embed/embedProfileSync';
import { queryClient } from '@/app/queryClient';
import { meQueryKey } from '@/queries/auth.queries';

vi.mock('@/services/authService', () => ({
  syncLoginusProfile: vi.fn(),
}));

vi.mock('@/embed/authSessionStorage', () => ({
  loadEmbedSession: vi.fn(() => null),
  saveEmbedSession: vi.fn(),
}));

vi.mock('@/embed/loginusBridge', () => ({
  requestLoginusInit: vi.fn(),
}));

import { syncLoginusProfile } from '@/services/authService';
import { saveEmbedSession } from '@/embed/authSessionStorage';
import { requestLoginusInit } from '@/embed/loginusBridge';
import { ApiError } from '@/services/apiClient';

describe('runEmbedProfileSync', () => {
  beforeEach(() => {
    useAuthUiStore.setState({
      embedStatus: 'ready',
      accessToken: 'token',
      user: MOCK_USER,
      authError: null,
    });
    queryClient.clear();
    vi.mocked(syncLoginusProfile).mockReset();
    vi.mocked(saveEmbedSession).mockReset();
    vi.mocked(requestLoginusInit).mockReset();
  });

  it('no-ops when embed is not ready', async () => {
    useAuthUiStore.setState({ embedStatus: 'waiting_init' });
    await runEmbedProfileSync('init-data');
    expect(syncLoginusProfile).not.toHaveBeenCalled();
  });

  it('syncs profile and updates store and me query when ready', async () => {
    const updatedUser = { ...MOCK_USER, display_name: 'Updated' };
    vi.mocked(syncLoginusProfile).mockResolvedValue({ user: updatedUser });

    await runEmbedProfileSync('init-data', { firstName: 'Updated' });

    expect(syncLoginusProfile).toHaveBeenCalledWith('init-data', {
      firstName: 'Updated',
    });
    expect(useAuthUiStore.getState().user).toEqual(updatedUser);
    expect(queryClient.getQueryData(meQueryKey)).toEqual(updatedUser);
  });

  it('requests fresh initData when sync fails with 401', async () => {
    vi.mocked(syncLoginusProfile).mockRejectedValue(
      new ApiError('Unauthorized', 401),
    );

    await runEmbedProfileSync('stale-init');

    expect(requestLoginusInit).toHaveBeenCalled();
    expect(useAuthUiStore.getState().authError).toBeNull();
  });
});

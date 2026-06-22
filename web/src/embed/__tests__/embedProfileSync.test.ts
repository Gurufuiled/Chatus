import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthUiStore } from '@/stores/authUiStore';
import { MOCK_USER } from '@/dev/uiPreview';
import { runEmbedProfileSync, requestLoginusProfileRecovery } from '@/embed/embedProfileSync';
import { queryClient } from '@/app/queryClient';
import { meQueryKey } from '@/queries/auth.queries';

vi.mock('@/services/authService', () => ({
  syncLoginusProfile: vi.fn(),
}));

vi.mock('@/embed/authSessionStorage', () => ({
  loadEmbedSession: vi.fn(() => null),
  saveEmbedSession: vi.fn(),
}));

vi.mock('@/embed/loginusBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/embed/loginusBridge')>();
  return {
    ...actual,
    requestLoginusInit: vi.fn(),
  };
});

import { syncLoginusProfile } from '@/services/authService';
import { saveEmbedSession } from '@/embed/authSessionStorage';
import { requestLoginusInit, listenForLoginusInit } from '@/embed/loginusBridge';
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
    expect(useAuthUiStore.getState().embedStatus).toBe('waiting_init');
    expect(useAuthUiStore.getState().authError).toBeNull();
  });

  it('requests fresh initData when sync fails with 403', async () => {
    vi.mocked(syncLoginusProfile).mockRejectedValue(
      new ApiError('Forbidden', 403),
    );

    await runEmbedProfileSync('stale-init');

    expect(requestLoginusInit).toHaveBeenCalled();
    expect(useAuthUiStore.getState().embedStatus).toBe('waiting_init');
  });

  it('accepts follow-up loginus:init after profile sync recovery', async () => {
    vi.mocked(syncLoginusProfile).mockRejectedValue(
      new ApiError('Unauthorized', 401),
    );
    const onInit = vi.fn();
    const unsubscribe = listenForLoginusInit((initData) => {
      const status = useAuthUiStore.getState().embedStatus;
      if (status === 'exchanging' || status === 'ready') return;
      onInit(initData);
    });

    await runEmbedProfileSync('stale-init');

    const event = new MessageEvent('message', {
      data: { type: 'loginus:init', initData: 'fresh-init' },
      origin: 'https://id.startapus.com',
      source: window.parent,
    });
    vi.spyOn(window, 'parent', 'get').mockReturnValue(event.source as Window);
    window.dispatchEvent(event);

    expect(onInit).toHaveBeenCalledWith('fresh-init');
    unsubscribe();
  });

  it('requestLoginusProfileRecovery sets waiting_init without clearing user', () => {
    requestLoginusProfileRecovery();

    expect(useAuthUiStore.getState().embedStatus).toBe('waiting_init');
    expect(useAuthUiStore.getState().user).toEqual(MOCK_USER);
    expect(useAuthUiStore.getState().accessToken).toBe('token');
    expect(requestLoginusInit).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyOAuthExchangeFromUrl, bootPublicAuth } from '@/auth/publicAuth';
import { useAuthUiStore } from '@/stores/authUiStore';

vi.mock('@/services/authService', () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('@/auth/webSessionStorage', () => ({
  loadWebSession: vi.fn(() => null),
  clearWebSession: vi.fn(),
  saveWebSession: vi.fn(),
}));

describe('publicAuth OAuth error preservation', () => {
  beforeEach(() => {
    useAuthUiStore.setState({
      embedStatus: 'needs_login',
      accessToken: null,
      user: null,
      authError: null,
    });
  });

  it('preserves auth_error when bootPublicAuth has preserveAuthError', async () => {
    applyOAuthExchangeFromUrl('invalid_state');
    expect(useAuthUiStore.getState().authError).toBe('invalid_state');

    await bootPublicAuth({ preserveAuthError: true });

    expect(useAuthUiStore.getState().embedStatus).toBe('needs_login');
    expect(useAuthUiStore.getState().authError).toBe('invalid_state');
  });

  it('preserves store auth error when preserveAuthError is inferred from store', async () => {
    applyOAuthExchangeFromUrl('invalid_state');
    await bootPublicAuth({ preserveAuthError: true });
    expect(useAuthUiStore.getState().authError).toBe('invalid_state');

    await bootPublicAuth({ preserveAuthError: !!useAuthUiStore.getState().authError });
    expect(useAuthUiStore.getState().authError).toBe('invalid_state');
  });

  it('clears auth error on boot when preserveAuthError is not set', async () => {
    applyOAuthExchangeFromUrl('invalid_state');
    await bootPublicAuth();
    expect(useAuthUiStore.getState().authError).toBeNull();
  });
});

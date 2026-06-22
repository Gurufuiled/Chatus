import { syncLoginusProfile } from '@/services/authService';
import { ApiError } from '@/services/apiClient';
import { queryClient } from '@/app/queryClient';
import { meQueryKey } from '@/queries/auth.queries';
import { useAuthUiStore } from '@/stores/authUiStore';
import type { LoginusProfilePayload } from './embedTypes';
import { loadEmbedSession, saveEmbedSession } from './authSessionStorage';
import { requestLoginusInit } from './loginusBridge';

export function requestLoginusProfileRecovery(): void {
  const store = useAuthUiStore.getState();
  store.setAuthError(null);
  store.setEmbedStatus('waiting_init');
  requestLoginusInit();
}

export async function runEmbedProfileSync(
  initData: string,
  profile?: LoginusProfilePayload,
): Promise<void> {
  const store = useAuthUiStore.getState();
  if (store.embedStatus !== 'ready') return;

  try {
    const { user } = await syncLoginusProfile(initData, profile);
    store.setUser(user);
    queryClient.setQueryData(meQueryKey, user);

    const stored = loadEmbedSession();
    if (stored?.refresh_token) {
      saveEmbedSession({
        refresh_token: stored.refresh_token,
        expires_at: stored.expires_at,
        user,
      });
    }
  } catch (err) {
    console.error('[embed] Loginus profile sync failed', err);
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      requestLoginusProfileRecovery();
    }
  }
}

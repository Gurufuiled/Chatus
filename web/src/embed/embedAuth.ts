import { exchangeLoginusInitData } from '@/services/authService';
import { setAccessToken } from '@/services/apiClient';
import { useAuthUiStore } from '@/stores/authUiStore';
import { activateUiPreview } from '@/dev/uiPreview';
import { postToLoginusParent } from './loginusBridge';

export async function runEmbedAuthExchange(initData: string): Promise<void> {
  const store = useAuthUiStore.getState();
  store.setEmbedStatus('exchanging');
  store.setAuthError(null);

  try {
    const session = await exchangeLoginusInitData(initData);
    setAccessToken(session.access_token);
    store.setAccessToken(session.access_token);
    store.setUser(session.user);
    store.setEmbedStatus('ready');
    postToLoginusParent({ type: 'loginus:ready' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth exchange failed';
    store.setEmbedStatus('error');
    store.setAuthError(message);
    postToLoginusParent({ type: 'loginus:error', message });
    throw err;
  }
}

export function activateDevAuthBypass(): void {
  if (import.meta.env.VITE_DEV_UI_PREVIEW === 'true') {
    activateUiPreview();
    return;
  }

  const token = import.meta.env.VITE_DEV_ACCESS_TOKEN as string | undefined;
  if (!token?.trim()) {
    useAuthUiStore.getState().setEmbedStatus('error');
    useAuthUiStore
      .getState()
      .setAuthError('VITE_DEV_ACCESS_TOKEN is required when VITE_DEV_SKIP_EMBED_AUTH=true');
    return;
  }

  setAccessToken(token.trim());
  useAuthUiStore.getState().setAccessToken(token.trim());
  useAuthUiStore.getState().setEmbedStatus('ready');
}

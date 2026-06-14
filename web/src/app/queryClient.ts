import { QueryClient } from '@tanstack/react-query';
import { useAuthUiStore } from '@/stores/authUiStore';

function handleUnauthorized() {
  useAuthUiStore.getState().setEmbedStatus('error');
  useAuthUiStore.getState().setAuthError('Session expired. Please reopen Chats in Loginus.');
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

queryClient.getQueryCache().subscribe((event) => {
  if (event?.type !== 'updated') return;
  const error = event.query.state.error;
  if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
    handleUnauthorized();
  }
});

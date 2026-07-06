import { QueryClient } from '@tanstack/react-query';
import { handlePublicAuthFailure } from '@/auth/publicAuth';

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

function isUnauthorizedError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error.status === 401 || error.status === 403),
  );
}

function onCacheAuthError(error: unknown): void {
  if (isUnauthorizedError(error)) {
    handlePublicAuthFailure();
  }
}

queryClient.getQueryCache().subscribe((event) => {
  if (event?.type !== 'updated') return;
  onCacheAuthError(event.query.state.error);
});

queryClient.getMutationCache().subscribe((event) => {
  if (event?.type !== 'updated') return;
  onCacheAuthError(event.mutation.state.error);
});

import { useQuery } from '@tanstack/react-query';
import { getMe } from '@/services/authService';
import { useAuthUiStore } from '@/stores/authUiStore';

export const meQueryKey = ['me'] as const;

export function useMeQuery() {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: meQueryKey,
    queryFn: getMe,
    enabled: ready,
  });
}

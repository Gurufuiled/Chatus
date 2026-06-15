import { useQuery } from '@tanstack/react-query';
import { searchUsers } from '@/services/profileService';
import { useAuthUiStore } from '@/stores/authUiStore';

export const userSearchQueryKey = (query: string) => ['users', 'search', query] as const;

export function useUserSearchQuery(query: string) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');
  const normalized = query.replace(/^@+/, '');

  return useQuery({
    queryKey: userSearchQueryKey(query),
    queryFn: () => searchUsers(query),
    enabled: ready && normalized.length > 0,
    staleTime: 30_000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { searchUsers, getUserById } from '@/services/profileService';
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

export const userDetailQueryKey = (id: string) => ['users', 'detail', id] as const;

export function useUserDetailQuery(id: string | undefined) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: userDetailQueryKey(id ?? ''),
    queryFn: () => getUserById(id!),
    enabled: ready && !!id,
    staleTime: 30_000,
  });
}

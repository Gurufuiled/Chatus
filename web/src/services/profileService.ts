import { apiRequest } from './apiClient';
import type { AuthUser } from '@/types/auth';
import type { UpdateProfilePayload } from '@/types/profile';

export async function searchUsers(query: string): Promise<AuthUser[]> {
  const q = query.trim();
  if (!q) return [];
  return apiRequest<AuthUser[]>(`/users/search?q=${encodeURIComponent(q)}`);
}

export async function getUserById(id: string): Promise<AuthUser> {
  return apiRequest<AuthUser>(`/users/${encodeURIComponent(id)}`);
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

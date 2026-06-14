import { apiRequest } from './apiClient';
import type { AuthUser } from '@/types/auth';
import type { UpdateProfilePayload } from '@/types/profile';

export async function updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

import { apiRequest } from './apiClient';
import type { AuthResponse } from '@/types/auth';
import { MOCK_USER, isUiPreviewMode } from '@/dev/uiPreview';

export async function exchangeLoginusInitData(initData: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/loginus/exchange', {
    method: 'POST',
    body: JSON.stringify({ init_data: initData }),
  });
}

export async function getMe() {
  if (isUiPreviewMode()) return MOCK_USER;
  return apiRequest<AuthResponse['user']>('/users/me');
}

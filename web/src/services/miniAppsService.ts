import { apiRequest } from './apiClient';

export interface MiniAppSummary {
  id: string;
  short_id: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  base_url: string;
  is_published: boolean;
  created_at: string;
}

export async function listMiniApps(): Promise<MiniAppSummary[]> {
  const body = await apiRequest<{ apps: MiniAppSummary[] }>('/mini-apps', { skipAuth: true });
  return body.apps ?? [];
}

export async function openChatusFatherChat(): Promise<{
  chat: { id: string; name?: string | null; chat_type: string };
}> {
  return apiRequest<{ chat: { id: string; name?: string | null; chat_type: string } }>(
    '/mini-apps/chatus-father',
  );
}

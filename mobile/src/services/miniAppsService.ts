import { apiFetch } from './apiClient';

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

export interface MiniAppSession {
  init_data: string;
  expires_at: number;
  base_url: string;
  app_id: string;
  /** Hosts the WebView may navigate to (app origin + OAuth IdP, etc.). */
  allowed_hosts?: string[];
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg: string | undefined;
    try {
      const body = await res.json();
      msg = (body && (body.message || body.error)) as string | undefined;
    } catch {
      // ignore
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listMiniApps(): Promise<MiniAppSummary[]> {
  const res = await apiFetch('/mini-apps', { skipAuth: true });
  const body = await jsonOrThrow<{ apps: MiniAppSummary[] }>(res);
  return body.apps ?? [];
}

export async function openMiniAppSession(appId: string): Promise<MiniAppSession> {
  const res = await apiFetch(`/mini-apps/${encodeURIComponent(appId)}/session`, {
    method: 'POST',
  });
  return jsonOrThrow<MiniAppSession>(res);
}

export async function openChatusFatherChat(): Promise<{
  chat: { id: string; name?: string | null; chat_type: string };
}> {
  const res = await apiFetch('/mini-apps/chatus-father');
  return jsonOrThrow<{ chat: { id: string; name?: string | null; chat_type: string } }>(res);
}

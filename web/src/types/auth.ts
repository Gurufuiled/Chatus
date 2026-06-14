export type EmbedStatus = 'waiting_init' | 'exchanging' | 'ready' | 'error';

export interface AuthUser {
  id: string;
  loginus_id: string | null;
  username: string | null;
  handle: string | null;
  display_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  birthday: number | null;
  is_online: boolean;
  last_seen: number | null;
  created_at: number;
  updated_at: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  user: AuthUser;
}

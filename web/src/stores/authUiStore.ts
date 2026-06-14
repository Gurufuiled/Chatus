import { create } from 'zustand';
import type { EmbedStatus, AuthUser } from '@/types/auth';

interface AuthUiState {
  embedStatus: EmbedStatus;
  authError: string | null;
  accessToken: string | null;
  user: AuthUser | null;
  setEmbedStatus: (status: EmbedStatus) => void;
  setAuthError: (error: string | null) => void;
  setAccessToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
}

export const useAuthUiStore = create<AuthUiState>((set) => ({
  embedStatus: 'waiting_init',
  authError: null,
  accessToken: null,
  user: null,
  setEmbedStatus: (embedStatus) => set({ embedStatus }),
  setAuthError: (authError) => set({ authError }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
}));

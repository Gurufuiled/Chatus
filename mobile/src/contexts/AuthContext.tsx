import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow, type AuthSession } from '../services/AuthService';
import {
  registerPushWithBackendAfterLogin,
  unregisterPushOnLogout,
} from '../services/pushNotificationsService';

type AuthContextType = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: ReturnType<typeof authStore.getState>['user'];
  accessToken: string | null;
  login: () => Promise<void>;
  /** После обмена OAuth-кода — сразу в стор, без повторного чтения SQLite. */
  completeLoginSession: (session: AuthSession) => Promise<void>;
  logout: () => Promise<void>;
  /** SLO URL to open in WebView after logout. Cleared when SLO completes. */
  sloUrlToOpen: string | null;
  clearSloUrl: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

type AuthProviderProps = {
  children: React.ReactNode;
  initialSession?: AuthSession | null;
};

export function AuthProvider({ children, initialSession = null }: AuthProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!initialSession);
  const [user, setUser] = useState(
    initialSession ? apiUserToUserRow(initialSession.user) : authStore.getState().user
  );
  const [accessToken, setAccessToken] = useState(
    initialSession?.accessToken ?? authStore.getState().accessToken
  );
  const [sloUrlToOpen, setSloUrlToOpen] = useState<string | null>(null);

  const syncFromStore = useCallback(() => {
    const state = authStore.getState();
    setIsAuthenticated(state.isAuthenticated);
    setUser(state.user);
    setAccessToken(state.accessToken);
  }, []);

  useEffect(() => {
    if (initialSession) {
      authStore.getState().setSession(apiUserToUserRow(initialSession.user), initialSession.accessToken);
    }
  }, [initialSession]);

  useEffect(() => {
    const unsub = authStore.subscribe(syncFromStore);
    return unsub;
  }, [syncFromStore]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        await registerPushWithBackendAfterLogin();
      } catch {
        console.warn('[Auth] push registration skipped or failed');
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, accessToken]);

  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      await authStore.getState().restoreSession();
      syncFromStore();
    } finally {
      setIsLoading(false);
    }
  }, [syncFromStore]);

  const completeLoginSession = useCallback(
    async (session: AuthSession) => {
      setIsLoading(true);
      try {
        authStore.getState().setSession(apiUserToUserRow(session.user), session.accessToken);
        syncFromStore();
      } finally {
        setIsLoading(false);
      }
    },
    [syncFromStore],
  );

  const logout = useCallback(async () => {
    try {
      await unregisterPushOnLogout();
    } catch {
      // ignore
    }
    try {
      const result = await authService.logout();
      if (result.slo_url) {
        setSloUrlToOpen(result.slo_url);
      }
    } finally {
      authStore.getState().clearSession();
      syncFromStore();
    }
  }, [syncFromStore]);

  const clearSloUrl = useCallback(() => setSloUrlToOpen(null), []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        user,
        accessToken,
        login,
        completeLoginSession,
        logout,
        sloUrlToOpen,
        clearSloUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

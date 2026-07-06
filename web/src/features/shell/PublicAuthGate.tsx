import { useEffect, useState } from 'react';
import {
  activateDevPublicAuthBypass,
  applyOAuthExchangeFromUrl,
  bootPublicAuth,
  startOAuthLogin,
} from '@/auth/publicAuth';
import { activateUiPreview, isUiPreviewMode } from '@/dev/uiPreview';
import { useAuthUiStore } from '@/stores/authUiStore';
import { Spinner } from '@/components/ui/Spinner';
import '@/features/shell/shell.css';

interface PublicAuthGateProps {
  children: React.ReactNode;
}

const DEV_SKIP =
  import.meta.env.DEV &&
  (import.meta.env.VITE_DEV_SKIP_EMBED_AUTH === 'true' || isUiPreviewMode());

export function PublicAuthGate({ children }: PublicAuthGateProps) {
  const embedStatus = useAuthUiStore((s) => s.embedStatus);
  const authError = useAuthUiStore((s) => s.authError);
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    if (isUiPreviewMode()) {
      activateUiPreview();
      return;
    }
    if (DEV_SKIP) {
      activateDevPublicAuthBypass();
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('auth_error');
    if (urlError) {
      applyOAuthExchangeFromUrl(urlError);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('auth_error');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);
    }

    void bootPublicAuth({
      preserveAuthError: !!urlError || !!useAuthUiStore.getState().authError,
    });
  }, []);

  const handleLogin = () => {
    setLoginPending(true);
    void startOAuthLogin().finally(() => setLoginPending(false));
  };

  if (embedStatus === 'needs_login') {
    return (
      <div className="auth-gate auth-gate--standalone">
        <div className="auth-gate__brand">ChatUs</div>
        <p className="auth-gate__text">Войдите через Loginus, чтобы открыть чаты</p>
        {authError ? (
          <p className="auth-gate__error" role="alert">
            {authError}
          </p>
        ) : null}
        <button
          type="button"
          className="auth-gate__login-btn"
          onClick={handleLogin}
          disabled={loginPending}
        >
          {loginPending ? 'Перенаправление…' : 'Войти через Loginus'}
        </button>
      </div>
    );
  }

  if (embedStatus === 'exchanging') {
    return (
      <div className="auth-gate">
        <Spinner label="Signing in" />
        <p className="auth-gate__text">Вход в ChatUs…</p>
      </div>
    );
  }

  if (embedStatus === 'error') {
    return (
      <div className="auth-gate auth-gate--error" role="alert">
        <p className="auth-gate__title">Не удалось войти</p>
        <p className="auth-gate__text">
          {authError ?? 'Неизвестная ошибка авторизации'}
        </p>
        <button type="button" className="auth-gate__login-btn" onClick={handleLogin}>
          Повторить вход
        </button>
      </div>
    );
  }

  if (embedStatus !== 'ready') {
    return (
      <div className="auth-gate">
        <Spinner label="Loading" />
      </div>
    );
  }

  return <>{children}</>;
}

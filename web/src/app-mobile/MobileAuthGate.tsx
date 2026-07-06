import { useEffect, useState } from 'react';
import {
  activateDevPublicAuthBypass,
  applyOAuthExchangeFromUrl,
  bootPublicAuth,
  startOAuthLogin,
} from '@/auth/publicAuth';
import { activateUiPreview, isUiPreviewMode } from '@/dev/uiPreview';
import { useAuthUiStore } from '@/stores/authUiStore';
import authBgUrl from '../../../mobile/assets/splash/auth-bg-clean.png';

const PRIVACY_CONSENT_KEY = 'chatus_privacy_policy_accepted_v1';
const PRIVACY_POLICY_URL = 'https://startapus.com/privacy';

interface MobileAuthGateProps {
  children: React.ReactNode;
}

const DEV_SKIP =
  import.meta.env.DEV &&
  (import.meta.env.VITE_DEV_SKIP_EMBED_AUTH === 'true' || isUiPreviewMode());

function MobileSpinner() {
  return <div className="mobile-auth__spinner" role="status" aria-label="Loading" />;
}

function LoginFooter({
  authError,
  loginPending,
  privacyAccepted,
  onLogin,
  onTogglePrivacy,
}: {
  authError: string | null;
  loginPending: boolean;
  privacyAccepted: boolean;
  onLogin: () => void;
  onTogglePrivacy: () => void;
}) {
  return (
    <div className="mobile-auth__footer">
      {authError ? (
        <p className="mobile-auth__error" role="alert">
          {authError}
        </p>
      ) : null}
      <button
        type="button"
        className="mobile-auth__btn"
        onClick={onLogin}
        disabled={loginPending || !privacyAccepted}
      >
        {loginPending ? 'Перенаправление…' : 'Войти с помощью Loginus'}
      </button>
      <div className="mobile-auth__privacy">
        <button
          type="button"
          className={`mobile-auth__checkbox${privacyAccepted ? ' mobile-auth__checkbox--on' : ''}`}
          onClick={onTogglePrivacy}
          aria-label="Согласие с политикой конфиденциальности"
          aria-pressed={privacyAccepted}
        >
          {privacyAccepted ? '✓' : null}
        </button>
        <p className="mobile-auth__privacy-text">
          Я принимаю{' '}
          <button
            type="button"
            className="mobile-auth__privacy-link"
            onClick={() => window.open(PRIVACY_POLICY_URL, '_blank', 'noopener')}
          >
            политику конфиденциальности
          </button>{' '}
          и даю согласие на обработку персональных данных
        </p>
      </div>
    </div>
  );
}

export function MobileAuthGate({ children }: MobileAuthGateProps) {
  const embedStatus = useAuthUiStore((s) => s.embedStatus);
  const authError = useAuthUiStore((s) => s.authError);
  const [loginPending, setLoginPending] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(PRIVACY_CONSENT_KEY) === '1') {
        setPrivacyAccepted(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

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

  const togglePrivacy = () => {
    setPrivacyAccepted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PRIVACY_CONSENT_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleLogin = () => {
    if (!privacyAccepted) return;
    setLoginPending(true);
    void startOAuthLogin().finally(() => setLoginPending(false));
  };

  if (embedStatus === 'needs_login' || embedStatus === 'error') {
    return (
      <div className="mobile-app mobile-auth">
        <img className="mobile-auth__bg" src={authBgUrl} alt="" />
        <div className="mobile-auth__overlay" aria-hidden />
        <div className="mobile-auth__brand">
          <div className="mobile-auth__chat-icon" aria-hidden>
            <span className="mobile-auth__chat-dot" />
            <span className="mobile-auth__chat-dot" />
            <span className="mobile-auth__chat-dot" />
          </div>
          <span className="mobile-auth__brand-text">Chatus</span>
        </div>
        <LoginFooter
          authError={authError}
          loginPending={loginPending}
          privacyAccepted={privacyAccepted}
          onLogin={handleLogin}
          onTogglePrivacy={togglePrivacy}
        />
      </div>
    );
  }

  if (embedStatus === 'exchanging') {
    return (
      <div className="mobile-app mobile-auth__status">
        <MobileSpinner />
        <p className="mobile-auth__status-text">Вход в Chatus…</p>
      </div>
    );
  }

  if (embedStatus !== 'ready') {
    return (
      <div className="mobile-app mobile-auth__status">
        <MobileSpinner />
      </div>
    );
  }

  return <>{children}</>;
}

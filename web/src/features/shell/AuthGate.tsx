import { useEffect } from 'react';
import { listenForLoginusInit, listenForLoginusProfileUpdated } from '@/embed/loginusBridge';
import {
  activateDevAuthBypass,
  bootEmbedAuth,
  prioritizeLoginusInit,
  runEmbedAuthExchange,
} from '@/embed/embedAuth';
import { runEmbedProfileSync } from '@/embed/embedProfileSync';
import { activateUiPreview, isUiPreviewMode } from '@/dev/uiPreview';
import { useAuthUiStore } from '@/stores/authUiStore';
import { Spinner } from '@/components/ui/Spinner';

interface AuthGateProps {
  children: React.ReactNode;
}

const DEV_SKIP =
  import.meta.env.DEV &&
  (import.meta.env.VITE_DEV_SKIP_EMBED_AUTH === 'true' || isUiPreviewMode());

export function AuthGate({ children }: AuthGateProps) {
  const embedStatus = useAuthUiStore((s) => s.embedStatus);
  const authError = useAuthUiStore((s) => s.authError);

  useEffect(() => {
    if (isUiPreviewMode()) {
      activateUiPreview();
      return;
    }
    if (DEV_SKIP) {
      activateDevAuthBypass();
      return;
    }

    const unsubscribeInit = listenForLoginusInit((initData, profile) => {
      const status = useAuthUiStore.getState().embedStatus;
      if (status === 'ready') return;
      prioritizeLoginusInit();
      void runEmbedAuthExchange(initData, profile);
    });

    const unsubscribeProfile = listenForLoginusProfileUpdated((initData, profile) => {
      void runEmbedProfileSync(initData, profile);
    });

    void bootEmbedAuth();

    return () => {
      unsubscribeInit();
      unsubscribeProfile();
    };
  }, []);

  if (embedStatus === 'waiting_init') {
    return (
      <div className="auth-gate">
        <Spinner label="Waiting for Loginus" />
        <p className="auth-gate__text">Ожидание авторизации Loginus…</p>
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
        <p className="auth-gate__hint">
          Обновите раздел «Чаты» в Loginus или войдите в аккаунт заново
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

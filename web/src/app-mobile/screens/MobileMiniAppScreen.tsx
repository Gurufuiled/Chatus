import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMeQuery } from '@/queries/auth.queries';
import { openMiniAppSession, type MiniAppSession } from '@/services/miniAppsService';
import { useMobileAppearance } from '../hooks/useMobileAppearance';
import {
  buildBridgeScript,
  defaultBridgeThemeFromScheme,
  injectBridgeIntoFrame,
  parseBridgeMessage,
  type BridgeInitContext,
} from '../miniapp/bridgeScript';

interface MobileMiniAppScreenProps {
  appId: string;
  title?: string;
}

function hostAllowed(url: string, allowedHosts: Set<string>): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'about:' || parsed.protocol === 'data:') return true;
    if (parsed.protocol !== 'https:') return false;
    return allowedHosts.has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

export function MobileMiniAppScreen({ appId, title }: MobileMiniAppScreenProps) {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { data: me } = useMeQuery();
  const { resolvedScheme } = useMobileAppearance();
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [inAppBrowserUrl, setInAppBrowserUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSession(null);
    setIsReady(false);
    void openMiniAppSession(appId)
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось открыть приложение');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const allowedHosts = useMemo(() => {
    const hosts = new Set<string>();
    if (session) {
      try {
        hosts.add(new URL(session.base_url).host.toLowerCase());
      } catch {
        /* ignore */
      }
      for (const host of session.allowed_hosts ?? []) {
        const trimmed = host?.trim().toLowerCase();
        if (trimmed) hosts.add(trimmed);
      }
    }
    hosts.add('id.startapus.com');
    return hosts;
  }, [session]);

  const bridgeContext = useMemo<BridgeInitContext | null>(() => {
    if (!session || !me?.id) return null;
    return {
      session,
      user: {
        id: me.id,
        display_name: me.display_name,
        username: me.username,
        avatar_url: me.avatar_url,
      },
      themeParams: defaultBridgeThemeFromScheme(resolvedScheme),
      colorScheme: resolvedScheme,
      platform: 'web',
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    };
  }, [me, resolvedScheme, session]);

  const bridgeScript = useMemo(
    () => (bridgeContext ? buildBridgeScript(bridgeContext) : null),
    [bridgeContext],
  );

  const injectBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !bridgeScript || !bridgeContext) return;
    const targetOrigin = session?.base_url ? new URL(session.base_url).origin : '*';
    injectBridgeIntoFrame(
      iframe,
      bridgeScript,
      {
        themeParams: bridgeContext.themeParams,
        colorScheme: bridgeContext.colorScheme,
        viewportHeight: bridgeContext.viewportHeight,
      },
      targetOrigin
    );
  }, [bridgeContext, bridgeScript, session?.base_url]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = parseBridgeMessage(event.data);
      if (!msg) return;
      switch (msg.type) {
        case 'ready':
          setIsReady(true);
          return;
        case 'close':
          if (window.history.length > 1) {
            window.history.back();
          } else {
            void navigate({ to: '/settings/services' });
          }
          return;
        case 'openLink':
          setInAppBrowserUrl(msg.url);
          return;
        default:
          return;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !bridgeContext) return;
    const onLoad = () => {
      injectBridge();
      try {
        const href = iframe.contentWindow?.location.href;
        if (href && href !== 'about:blank' && !hostAllowed(href, allowedHosts)) {
          iframe.src = session?.base_url ?? 'about:blank';
        }
      } catch {
        /* cross-origin navigation is expected for external mini-apps */
      }
    };
    iframe.addEventListener('load', onLoad);
    if (iframe.contentDocument?.readyState === 'complete') {
      onLoad();
    }
    return () => iframe.removeEventListener('load', onLoad);
  }, [allowedHosts, bridgeContext, injectBridge, session?.base_url]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !bridgeContext) return;
    const targetOrigin = session?.base_url ? new URL(session.base_url).origin : '*';
    iframe.contentWindow.postMessage(
      JSON.stringify({
        type: 'theme',
        themeParams: bridgeContext.themeParams,
        colorScheme: bridgeContext.colorScheme,
      }),
      targetOrigin,
    );
  }, [bridgeContext, session?.base_url]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    void navigate({ to: '/settings/services' });
  }, [navigate]);

  if (error) {
    return (
      <div className="mobile-miniapp">
        <header className="mobile-miniapp__header">
          <button type="button" className="mobile-miniapp__header-btn" onClick={handleBack}>
            Закрыть
          </button>
          <h1 className="mobile-miniapp__title">{title ?? 'Mini App'}</h1>
          <span className="mobile-miniapp__header-btn" aria-hidden />
        </header>
        <div className="mobile-miniapp__center">
          <p className="mobile-miniapp__error">{error}</p>
        </div>
      </div>
    );
  }

  if (!session || !bridgeScript) {
    return (
      <div className="mobile-miniapp">
        <header className="mobile-miniapp__header">
          <button type="button" className="mobile-miniapp__header-btn" onClick={handleBack}>
            Закрыть
          </button>
          <h1 className="mobile-miniapp__title">{title ?? 'Mini App'}</h1>
          <span className="mobile-miniapp__header-btn" aria-hidden />
        </header>
        <div className="mobile-miniapp__center">
          <div className="mobile-miniapp__spinner" aria-label="Загрузка" />
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-miniapp">
      <header className="mobile-miniapp__header">
        <button type="button" className="mobile-miniapp__header-btn" onClick={handleBack}>
          Закрыть
        </button>
        <h1 className="mobile-miniapp__title">{title ?? 'Mini App'}</h1>
        <span className="mobile-miniapp__header-btn" aria-hidden />
      </header>

      <div className="mobile-miniapp__frame-wrap">
        <iframe
          ref={iframeRef}
          title={title ?? 'Mini App'}
          className="mobile-miniapp__frame"
          src={session.base_url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
        {!isReady ? (
          <div className="mobile-miniapp__ready-hint" aria-hidden>
            <div className="mobile-miniapp__spinner" />
          </div>
        ) : null}
      </div>

      {inAppBrowserUrl ? (
        <MobileMiniAppBrowserOverlay
          url={inAppBrowserUrl}
          allowedHosts={allowedHosts}
          onClose={() => setInAppBrowserUrl(null)}
        />
      ) : null}
    </div>
  );
}

function MobileMiniAppBrowserOverlay({
  url,
  allowedHosts,
  onClose,
}: {
  url: string;
  allowedHosts: Set<string>;
  onClose: () => void;
}) {
  const host = useMemo(() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }, [url]);

  const openExternally = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mobile-miniapp__browser">
      <header className="mobile-miniapp__header">
        <button type="button" className="mobile-miniapp__header-btn" onClick={onClose}>
          Готово
        </button>
        <p className="mobile-miniapp__browser-host">{host}</p>
        <button type="button" className="mobile-miniapp__header-btn" onClick={openExternally}>
          Открыть
        </button>
      </header>
      <iframe
        title={host}
        className="mobile-miniapp__frame"
        src={hostAllowed(url, allowedHosts) ? url : 'about:blank'}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

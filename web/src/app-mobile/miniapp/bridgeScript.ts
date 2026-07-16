import type { MiniAppSession } from '@/services/miniAppsService';

export interface BridgeThemeParams {
  bg_color: string;
  text_color: string;
  hint_color: string;
  link_color: string;
  button_color: string;
  button_text_color: string;
  secondary_bg_color: string;
}

export interface BridgeInitContext {
  session: MiniAppSession;
  user: {
    id: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
  themeParams: BridgeThemeParams;
  colorScheme: 'light' | 'dark';
  platform: 'android' | 'ios' | 'web';
  viewportHeight: number;
}

export function defaultBridgeThemeFromScheme(scheme: 'light' | 'dark'): BridgeThemeParams {
  if (scheme === 'dark') {
    return {
      bg_color: '#0e1621',
      text_color: '#f5f5f7',
      hint_color: '#9aa0a6',
      link_color: '#6cb0f5',
      button_color: '#5ca8ff',
      button_text_color: '#ffffff',
      secondary_bg_color: '#1a2330',
    };
  }
  return {
    bg_color: '#e7ebf0',
    text_color: '#1a1d21',
    hint_color: '#5c6370',
    link_color: '#2b75c6',
    button_color: '#3390ec',
    button_text_color: '#ffffff',
    secondary_bg_color: '#f4f4f5',
  };
}

/**
 * JS injected into the mini-app frame before scripts run (same-origin) or via postMessage host handshake.
 */
export function buildBridgeScript(context: BridgeInitContext): string {
  const payload = JSON.stringify({
    version: '1.0',
    platform: context.platform,
    initData: context.session.init_data,
    initDataUnsafe: {
      user: context.user,
      auth_date: Math.floor(Date.now() / 1000),
      app_id: context.session.app_id,
    },
    themeParams: context.themeParams,
    colorScheme: context.colorScheme,
    viewportHeight: context.viewportHeight,
  });

  return `
(function () {
  if (window.ChatusWebApp) return;
  var ctx = ${payload};
  var listeners = { themeChanged: [], viewportChanged: [] };

  function post(msg) {
    var raw = JSON.stringify(msg);
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(raw);
    }
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage(raw, window.location.origin); } catch (e) {}
    }
  }

  function installBridge() {
    if (window.ChatusWebApp) return;
    var api = {
      version: ctx.version,
      platform: ctx.platform,
      initData: ctx.initData,
      initDataUnsafe: ctx.initDataUnsafe,
      themeParams: ctx.themeParams,
      colorScheme: ctx.colorScheme,
      viewportHeight: ctx.viewportHeight,
      ready: function () { post({ type: 'ready' }); },
      close: function () { post({ type: 'close' }); },
      sendData: function (data) {
        if (typeof data !== 'string') data = String(data == null ? '' : data);
        post({ type: 'sendData', data: data });
      },
      openLink: function (url) {
        if (typeof url !== 'string' || url.indexOf('https://') !== 0) return;
        post({ type: 'openLink', url: url });
      },
      onEvent: function (event, cb) {
        if (listeners[event]) listeners[event].push(cb);
      },
      offEvent: function (event, cb) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(function (x) { return x !== cb; });
      },
    };
    Object.defineProperty(window, 'ChatusWebApp', { value: api, configurable: false, writable: false });
    window.Chatus = window.Chatus || {};
    window.Chatus.WebApp = api;
  }

  installBridge();

  window.addEventListener('message', function (ev) {
    try {
      var data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'chatus-init') {
        if (data.themeParams) ctx.themeParams = data.themeParams;
        if (data.colorScheme) ctx.colorScheme = data.colorScheme;
        if (typeof data.viewportHeight === 'number') ctx.viewportHeight = data.viewportHeight;
        installBridge();
        return;
      }
      if (data.type === 'theme' && data.themeParams) {
        if (!window.ChatusWebApp) installBridge();
        window.ChatusWebApp.themeParams = data.themeParams;
        window.ChatusWebApp.colorScheme = data.colorScheme || window.ChatusWebApp.colorScheme;
        listeners.themeChanged.forEach(function (cb) { try { cb(); } catch (e) {} });
      }
      if (data.type === 'viewport' && typeof data.viewportHeight === 'number') {
        if (!window.ChatusWebApp) installBridge();
        window.ChatusWebApp.viewportHeight = data.viewportHeight;
        listeners.viewportChanged.forEach(function (cb) { try { cb(); } catch (e) {} });
      }
    } catch (e) {}
  });
})();
true;
`;
}

export type BridgeMessage =
  | { type: 'ready' }
  | { type: 'close' }
  | { type: 'sendData'; data: string }
  | { type: 'openLink'; url: string };

export function parseBridgeMessage(raw: unknown): BridgeMessage | null {
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as BridgeMessage;
    if (!data || typeof data !== 'object' || !('type' in data)) return null;
    switch (data.type) {
      case 'ready':
      case 'close':
        return data;
      case 'sendData':
        return typeof data.data === 'string' ? data : null;
      case 'openLink':
        return typeof data.url === 'string' && data.url.startsWith('https://') ? data : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function injectBridgeIntoFrame(
  iframe: HTMLIFrameElement,
  script: string,
  initMessage: Record<string, unknown>,
): void {
  try {
    const doc = iframe.contentDocument;
    if (doc?.documentElement) {
      const el = doc.createElement('script');
      el.textContent = script.replace(/<\//g, '<\\/');
      doc.documentElement.prepend(el);
      return;
    }
  } catch {
    /* cross-origin */
  }

  // NOTE: In a real-world scenario, you might want to specify the actual target origin
  // instead of '*' if you know the exact URL of the mini-app being hosted to prevent
  // information leakage. For now, since the miniapps can be arbitrary URLs, we attempt
  // to restrict it to window.location.origin or the iframe's src.
  let targetOrigin = '*';
  try {
    if (iframe.src) {
      const url = new URL(iframe.src);
      targetOrigin = url.origin;
    }
  } catch (e) {
    // Ignore invalid URL
  }

  iframe.contentWindow?.postMessage(JSON.stringify({ type: 'chatus-init', ...initMessage }), targetOrigin);
}

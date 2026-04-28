import type { ThemeColors } from '../theme/palettes';
import type { MiniAppSession } from '../services/miniAppsService';

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
  platform: 'android' | 'ios';
  viewportHeight: number;
}

export function defaultBridgeThemeFromColors(colors: ThemeColors): BridgeThemeParams {
  return {
    bg_color: colors.chatBackground,
    text_color: colors.textPrimary,
    hint_color: colors.textSecondary,
    link_color: colors.link,
    button_color: colors.accent,
    button_text_color: '#ffffff',
    secondary_bg_color: colors.inputBackgroundSolid,
  };
}

/**
 * Generates the JS injected into the WebView BEFORE the mini-app HTML loads.
 * Exposes `window.ChatusWebApp` per obsidian-vault/Topics/ChatusWebApp.md (v1.0).
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
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

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

  window.addEventListener('message', function (ev) {
    try {
      var data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'theme' && data.themeParams) {
        api.themeParams = data.themeParams;
        api.colorScheme = data.colorScheme || api.colorScheme;
        listeners.themeChanged.forEach(function (cb) { try { cb(); } catch (e) {} });
      }
      if (data.type === 'viewport' && typeof data.viewportHeight === 'number') {
        api.viewportHeight = data.viewportHeight;
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

export function parseBridgeMessage(raw: string): BridgeMessage | null {
  try {
    const data = JSON.parse(raw) as BridgeMessage;
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

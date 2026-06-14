import type { LoginusInboundMessage, LoginusOutboundMessage } from './embedTypes';

const DEFAULT_ORIGINS = ['https://id.startapus.com'];

function getAllowedOrigins(): string[] {
  const raw = import.meta.env.VITE_LOGINUS_ORIGINS as string | undefined;
  if (!raw?.trim()) return DEFAULT_ORIGINS;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  try {
    const patternHost = new URL(pattern).hostname;
    return hostname === patternHost;
  } catch {
    return hostname === pattern;
  }
}

function isAllowedOrigin(origin: string): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  return allowed.some((entry) => {
    if (entry.startsWith('http://') || entry.startsWith('https://')) {
      try {
        return new URL(entry).origin === origin;
      } catch {
        return false;
      }
    }
    return hostnameMatchesPattern(hostname, entry);
  });
}

function getParentTargetOrigin(): string {
  const allowed = getAllowedOrigins();
  if (allowed.length === 1 && allowed[0].startsWith('http')) {
    return allowed[0];
  }
  return 'https://id.startapus.com';
}

export type InitDataHandler = (initData: string) => void;

export function listenForLoginusInit(onInit: InitDataHandler): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (!isAllowedOrigin(event.origin)) return;

    const data = event.data as LoginusInboundMessage | undefined;
    if (!data || data.type !== 'loginus:init' || typeof data.initData !== 'string') {
      return;
    }

    onInit(data.initData);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function postToLoginusParent(message: LoginusOutboundMessage) {
  if (window.parent === window) return;
  window.parent.postMessage(message, getParentTargetOrigin());
}

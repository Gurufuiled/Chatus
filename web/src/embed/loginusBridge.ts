import type {
  LoginusInboundMessage,
  LoginusOutboundMessage,
  LoginusProfilePayload,
} from './embedTypes';

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

let parentTargetOrigin: string | null = null;

function getParentTargetOrigin(): string {
  if (parentTargetOrigin) return parentTargetOrigin;
  const allowed = getAllowedOrigins();
  if (allowed.length === 1 && allowed[0].startsWith('http')) {
    return allowed[0];
  }
  return 'https://id.startapus.com';
}

function rememberParentOrigin(origin: string): void {
  parentTargetOrigin = origin;
}

function parseInboundMessage(data: unknown): LoginusInboundMessage | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as LoginusInboundMessage;
  if (typeof msg.initData !== 'string' || !msg.initData) return null;
  if (msg.type === 'loginus:init' || msg.type === 'loginus:profileUpdated') {
    return msg;
  }
  return null;
}

export type InitDataHandler = (
  initData: string,
  profile?: LoginusProfilePayload,
) => void;

export type ProfileUpdatedHandler = (
  initData: string,
  profile?: LoginusProfilePayload,
) => void;

export function listenForLoginusInit(onInit: InitDataHandler): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (!isAllowedOrigin(event.origin)) return;

    const data = parseInboundMessage(event.data);
    if (!data || data.type !== 'loginus:init') return;

    rememberParentOrigin(event.origin);
    onInit(data.initData, data.profile);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function listenForLoginusProfileUpdated(
  onProfileUpdated: ProfileUpdatedHandler,
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (!isAllowedOrigin(event.origin)) return;

    const data = parseInboundMessage(event.data);
    if (!data || data.type !== 'loginus:profileUpdated') return;

    rememberParentOrigin(event.origin);
    onProfileUpdated(data.initData, data.profile);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function postToLoginusParent(message: LoginusOutboundMessage) {
  if (window.parent === window) return;
  window.parent.postMessage(message, getParentTargetOrigin());
}

export function requestLoginusInit(): void {
  postToLoginusParent({ type: 'loginus:requestInit' });
}

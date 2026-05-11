export const MESSAGE_TRANSPORTS = ['websocket', 'p2p'] as const;

export type MessageTransport = (typeof MESSAGE_TRANSPORTS)[number];

const LEGACY_WEBSOCKET_TRANSPORTS = new Set(['api', 'server', 'ws']);
const warnedUnknownTransports = new Set<string>();

function warnUnknownTransport(raw: string): void {
  if (!raw || raw === 'websocket' || raw === 'p2p' || LEGACY_WEBSOCKET_TRANSPORTS.has(raw)) {
    return;
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedUnknownTransports.has(raw)) {
    warnedUnknownTransports.add(raw);
    console.warn(`[messageTransport] Unknown transport "${raw}", falling back to websocket`);
  }
}

export function normalizeMessageTransport(value: unknown): MessageTransport {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';

  switch (raw) {
    case 'p2p':
      return 'p2p';
    case 'websocket':
    case 'api':
    case 'ws':
    case 'server':
      return 'websocket';
    default:
      warnUnknownTransport(raw);
      return 'websocket';
  }
}

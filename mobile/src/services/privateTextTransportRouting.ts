import {
  decideP2PTextAttempt,
  type P2PDecisionChatSnapshot,
  type P2PSendSkipReason,
} from './p2pSendDecision';

/**
 * Результат маршрутизации текста в личке для {@link TransportService.sendMessage}:
 * либо попытка peer-first, либо сразу сервер/очередь (без попытки peer).
 */
export type PrivateTextTransportRoute =
  | { mode: 'peer_first'; recipientUserId: string }
  /** Нет попытки peer; дальше — WS `send_message` или офлайн-очередь (см. `sendTextViaServerOrQueue`). */
  | { mode: 'server_direct'; skipReason: P2PSendSkipReason };

export function resolvePrivateTextTransportRoute(input: {
  enabled: boolean;
  msgType: string;
  chat: P2PDecisionChatSnapshot;
  currentUserId: string | null | undefined;
}): PrivateTextTransportRoute {
  const d = decideP2PTextAttempt(input);
  if (d.attemptPeer === false) {
    return { mode: 'server_direct', skipReason: d.reason };
  }
  return { mode: 'peer_first', recipientUserId: d.recipientUserId };
}

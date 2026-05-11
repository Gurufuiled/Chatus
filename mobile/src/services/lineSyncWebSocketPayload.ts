/**
 * Pure validation for chat-WebSocket `line_tail` JSON frames (server gateway envelope).
 * Kept separate from LineSyncService so Node/tsx tests do not load React Native.
 */

/** Result of validating a `line_tail` frame before DAO merge. */
export type ParseLineTailWebSocketResult =
  | { ok: true; lineId: string; events: unknown[] }
  | {
      ok: false;
      reason: 'not_object' | 'wrong_type' | 'no_line_id' | 'server_error';
      /** Set when `reason === 'server_error'` */
      serverErrorMessage?: string;
    };

/**
 * Pure parse for `type: 'line_tail'` payloads.
 * Non-array `events` is treated as `[]`, matching merge behavior.
 */
export function parseLineTailWebSocketPayload(msg: unknown): ParseLineTailWebSocketResult {
  if (!msg || typeof msg !== 'object') {
    return { ok: false, reason: 'not_object' };
  }
  const m = msg as Record<string, unknown>;
  if (m.type !== 'line_tail') {
    return { ok: false, reason: 'wrong_type' };
  }
  // Only non-empty (after trim) `error` blocks merge; `''` / whitespace match "no error" for recovery paths.
  if (m.error != null && String(m.error).trim().length > 0) {
    return {
      ok: false,
      reason: 'server_error',
      serverErrorMessage: String(m.error),
    };
  }
  const lineId = typeof m.line_id === 'string' ? m.line_id.trim() : '';
  if (!lineId) {
    return { ok: false, reason: 'no_line_id' };
  }
  const events = Array.isArray(m.events) ? m.events : [];
  return { ok: true, lineId, events };
}

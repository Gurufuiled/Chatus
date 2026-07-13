const GROUP_CALL_RECORDING_MSG = 'group_call_recording' as const;
const RECORDING_DISPLAY_NAME_MAX = 64;

export type GroupCallRecordingMessage = {
  type: typeof GROUP_CALL_RECORDING_MSG;
  active: boolean;
  byUserId: string;
  byDisplayName: string;
};

export function truncateRecordingDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Участник';
  if (trimmed.length <= RECORDING_DISPLAY_NAME_MAX) return trimmed;
  return `${trimmed.slice(0, RECORDING_DISPLAY_NAME_MAX - 1)}…`;
}

export function parseGroupCallRecordingMessage(
  payload: Uint8Array,
  decoder = new TextDecoder(),
): GroupCallRecordingMessage | null {
  try {
    const raw = JSON.parse(decoder.decode(payload)) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (obj.type !== GROUP_CALL_RECORDING_MSG) return null;
    if (typeof obj.active !== 'boolean' || typeof obj.byUserId !== 'string') return null;
    const byUserId = obj.byUserId.trim();
    if (!byUserId) return null;
    const byDisplayName =
      typeof obj.byDisplayName === 'string'
        ? truncateRecordingDisplayName(obj.byDisplayName)
        : 'Участник';
    return {
      type: GROUP_CALL_RECORDING_MSG,
      active: obj.active,
      byUserId,
      byDisplayName,
    };
  } catch {
    return null;
  }
}

export function buildGroupCallRecordingPayload(
  active: boolean,
  byUserId: string,
  byDisplayName: string,
  encoder = new TextEncoder(),
): Uint8Array {
  const msg: GroupCallRecordingMessage = {
    type: GROUP_CALL_RECORDING_MSG,
    active,
    byUserId,
    byDisplayName: truncateRecordingDisplayName(byDisplayName || 'Участник'),
  };
  return encoder.encode(JSON.stringify(msg));
}

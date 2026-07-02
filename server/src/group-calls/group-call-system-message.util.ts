export type GroupCallSystemAction = 'started' | 'ended';

export type GroupCallSystemPayload = {
  v: 1;
  kind: 'group_call';
  action: GroupCallSystemAction;
  room_id: string;
  display: string;
  duration_minutes?: number;
};

export function buildGroupCallSystemContent(
  payload: GroupCallSystemPayload,
): string {
  return JSON.stringify(payload);
}

export function parseGroupCallSystemContent(
  content: string | null | undefined,
): GroupCallSystemPayload | null {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content) as Partial<GroupCallSystemPayload>;
    if (
      parsed?.v === 1 &&
      parsed.kind === 'group_call' &&
      (parsed.action === 'started' || parsed.action === 'ended') &&
      typeof parsed.room_id === 'string' &&
      typeof parsed.display === 'string'
    ) {
      return parsed as GroupCallSystemPayload;
    }
  } catch {
    return null;
  }
  return null;
}

import type { GroupCallParticipant } from '../contexts/GroupCallContext';

export type GroupCallSystemAction = 'started' | 'ended';

export type GroupCallSystemPayload = {
  v: 1;
  kind: 'group_call';
  action: GroupCallSystemAction;
  room_id: string;
  display: string;
  duration_minutes?: number;
};

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

/** Human-readable chat-list preview for group-call system messages. */
export function formatGroupCallDialogPreview(
  content: string | null | undefined,
): string | null {
  const payload = parseGroupCallSystemContent(content);
  if (payload) {
    const display = payload.display.trim();
    if (display) return display;
    return payload.action === 'ended'
      ? 'Голосовой звонок завершён'
      : 'Голосовой звонок';
  }

  // Broken/truncated previews sometimes lose JSON punctuation.
  if (content && /kind["\s:=]*group_call/.test(content)) {
    if (/ended|заверш/i.test(content)) return 'Голосовой звонок завершён';
    return 'Голосовой звонок';
  }

  return null;
}

export function formatGroupCallParticipantNames(
  participants: GroupCallParticipant[],
  maxNames = 2,
): string {
  if (participants.length === 0) return '';
  const names = participants.slice(0, maxNames).map((p) => p.displayName);
  const rest = participants.length - names.length;
  if (rest <= 0) return names.join(', ');
  return `${names.join(', ')} и ещё ${rest}`;
}

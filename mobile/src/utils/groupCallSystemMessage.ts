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

/** Solid incoming-bubble fill for in-chat group call system messages (Android parity). */
export function getGroupCallSystemBubbleBackground(bubbleOtherColor: string): string {
  return bubbleOtherColor;
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

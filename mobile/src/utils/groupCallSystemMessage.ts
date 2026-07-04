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

/** Human-readable chat-list preview for group_call system messages. */
export function groupCallSystemPreviewText(
  content: string | null | undefined,
): string | null {
  return parseGroupCallSystemContent(content)?.display ?? null;
}

/** Detects stored preview strings emitted for group-call system messages. */
export function isGroupCallPreviewText(text: string | null | undefined): boolean {
  const trimmed = text?.trim();
  if (!trimmed) return false;
  if (parseGroupCallSystemContent(trimmed)) return true;
  return trimmed.toLowerCase().includes('голосовой чат');
}

export function formatParticipantCount(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} участник`;
  if (
    count % 10 >= 2 &&
    count % 10 <= 4 &&
    (count % 100 < 10 || count % 100 >= 20)
  ) {
    return `${count} участника`;
  }
  return `${count} участников`;
}

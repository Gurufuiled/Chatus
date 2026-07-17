import type { ChatSummary } from '@/types/chat';

export const MAX_TYPING_AVATARS = 3;

export type TypingPerson = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

function memberDisplayName(chat: ChatSummary, userId: string): { name: string; avatarUrl: string | null } {
  const member = chat.members?.find((m) => m.user_id === userId);
  const full =
    member?.user?.display_name?.trim() ||
    member?.user?.username?.trim() ||
    member?.user?.handle?.trim() ||
    'Участник';
  const firstName = full.split(/\s+/).filter(Boolean)[0] || full;
  return {
    name: firstName,
    avatarUrl: member?.user?.avatar_url ?? null,
  };
}

/** Resolve typing user ids against chat members (first name + avatar). */
export function resolveTypingPeople(chat: ChatSummary, userIds: string[]): TypingPerson[] {
  return userIds.map((userId) => {
    const { name, avatarUrl } = memberDisplayName(chat, userId);
    return { userId, displayName: name, avatarUrl };
  });
}

/** Russian plural: N человек / человека + печатает/печатают. */
export function formatTypingPeopleCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'человек'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'человека'
        : 'человек';
  const verb = mod10 === 1 && mod100 !== 11 ? 'печатает' : 'печатают';
  return `${count} ${noun} ${verb}...`;
}

/**
 * Telegram-like typing subtitle:
 * - private: «печатает...»
 * - group 1: «Имя печатает...»
 * - group 2: «A и B печатают...»
 * - group 3+: «N человек(а) печатает/печатают...»
 */
export function formatTypingLabel(people: TypingPerson[], isGroupChat: boolean): string | null {
  if (people.length === 0) return null;
  if (!isGroupChat) return 'печатает...';
  if (people.length === 1) return `${people[0].displayName} печатает...`;
  if (people.length === 2) {
    return `${people[0].displayName} и ${people[1].displayName} печатают...`;
  }
  return formatTypingPeopleCount(people.length);
}

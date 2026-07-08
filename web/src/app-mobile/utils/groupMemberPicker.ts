import type { AuthUser } from '@/types/auth';
import type { ChatSummary } from '@/types/chat';

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function hasValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function mergeUsers(primary: AuthUser, fallback: AuthUser): AuthUser {
  return {
    ...fallback,
    ...primary,
    username: hasValue(primary.username) ? primary.username : fallback.username,
    handle: hasValue(primary.handle) ? primary.handle : fallback.handle,
    display_name: hasValue(primary.display_name) ? primary.display_name : fallback.display_name,
    last_name: hasValue(primary.last_name) ? primary.last_name : fallback.last_name,
    avatar_url: hasValue(primary.avatar_url) ? primary.avatar_url : fallback.avatar_url,
    phone: hasValue(primary.phone) ? primary.phone : fallback.phone,
    bio: hasValue(primary.bio) ? primary.bio : fallback.bio,
    birthday:
      primary.birthday != null && primary.birthday > 0
        ? primary.birthday
        : fallback.birthday ?? null,
    last_seen: primary.last_seen ?? fallback.last_seen,
    created_at: primary.created_at || fallback.created_at || Date.now(),
    updated_at: Math.max(primary.updated_at || 0, fallback.updated_at || 0) || Date.now(),
  };
}

export function getContactSortName(user: AuthUser) {
  const combined = [user.display_name?.trim(), user.last_name?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  return (
    combined ||
    user.display_name?.trim() ||
    user.username?.trim() ||
    user.handle?.trim() ||
    user.id
  );
}

function buildQueryTokens(user: AuthUser) {
  const combined = [user.display_name?.trim(), user.last_name?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();
  return [
    normalizeText(user.display_name),
    normalizeText(user.last_name),
    combined,
    normalizeText(user.username),
    normalizeText(user.handle),
    user.handle ? `@${normalizeText(user.handle)}` : '',
  ].filter(Boolean);
}

export function getGroupMemberPickerContacts(params: {
  chats: ChatSummary[];
  currentUserId: string | null;
  excludedUserIds?: Iterable<string>;
}): AuthUser[] {
  const { chats, currentUserId, excludedUserIds } = params;
  const excluded = new Set(excludedUserIds ?? []);
  const byId = new Map<
    string,
    { user: AuthUser; isPrivate: boolean; lastActivityAt: number }
  >();

  for (const chat of chats) {
    const lastActivityAt = chat.last_message_at ?? chat.updated_at ?? chat.created_at ?? 0;
    const isPrivate = chat.chat_type === 'private';

    for (const member of chat.members ?? []) {
      const userId = member.user?.id ?? member.user_id;
      if (!userId || userId === currentUserId || excluded.has(userId)) continue;

      const fallbackDisplayName =
        isPrivate && userId !== currentUserId ? chat.peer_display_name?.trim() || null : null;
      const nextUser: AuthUser = {
        id: userId,
        loginus_id: null,
        username: member.user?.username ?? null,
        handle: member.user?.handle ?? null,
        display_name: member.user?.display_name ?? fallbackDisplayName,
        last_name: null,
        avatar_url: member.user?.avatar_url ?? null,
        phone: member.user?.phone ?? null,
        bio: null,
        birthday: null,
        is_online: member.user?.is_online ?? false,
        last_seen: member.user?.last_seen ?? null,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
      };

      if (!hasValue(nextUser.display_name) && !hasValue(nextUser.username) && !hasValue(nextUser.handle)) {
        nextUser.display_name = 'Пользователь';
      }

      const existing = byId.get(userId);
      if (!existing) {
        byId.set(userId, { user: nextUser, isPrivate, lastActivityAt });
        continue;
      }

      const shouldReplace =
        Number(isPrivate) > Number(existing.isPrivate) ||
        (Number(isPrivate) === Number(existing.isPrivate) &&
          lastActivityAt > existing.lastActivityAt);

      const primaryUser = shouldReplace ? nextUser : existing.user;
      const fallbackUser = shouldReplace ? existing.user : nextUser;

      byId.set(userId, {
        user: mergeUsers(primaryUser, fallbackUser),
        isPrivate: shouldReplace ? isPrivate : existing.isPrivate,
        lastActivityAt: shouldReplace ? lastActivityAt : existing.lastActivityAt,
      });
    }
  }

  return Array.from(byId.values())
    .sort((left, right) => {
      if (left.isPrivate !== right.isPrivate) {
        return Number(right.isPrivate) - Number(left.isPrivate);
      }
      if (left.lastActivityAt !== right.lastActivityAt) {
        return right.lastActivityAt - left.lastActivityAt;
      }
      return getContactSortName(left.user).localeCompare(getContactSortName(right.user), undefined, {
        sensitivity: 'base',
      });
    })
    .map(({ user }) => user);
}

export function filterGroupMemberPickerUsers(users: AuthUser[], query: string): AuthUser[] {
  const normalizedQuery = normalizeText(query.replace(/^@+/, ''));
  if (!normalizedQuery) return users;
  return users.filter((user) =>
    buildQueryTokens(user).some((token) => token.includes(normalizedQuery)),
  );
}

export function mergeGroupMemberPickerUsers(...lists: AuthUser[][]): AuthUser[] {
  const orderedIds: string[] = [];
  const byId = new Map<string, AuthUser>();

  for (const list of lists) {
    for (const user of list) {
      const existing = byId.get(user.id);
      if (!existing) {
        orderedIds.push(user.id);
        byId.set(user.id, user);
        continue;
      }
      byId.set(user.id, mergeUsers(existing, user));
    }
  }

  return orderedIds
    .map((userId) => byId.get(userId))
    .filter((user): user is AuthUser => user != null);
}

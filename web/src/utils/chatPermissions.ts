import type { ChatSummary, GroupPermissions } from '@/types/chat';
import type {
  EffectiveGroupPermissions,
  GroupMemberPermissions,
} from '@/types/groupSettings';

export type ChatPermissionUser = { id: string } | null | undefined;

function readBool(
  source: Record<string, unknown> | null | undefined,
  snake: string,
  camel: string,
): boolean | undefined {
  if (!source) return undefined;
  const snakeVal = source[snake];
  if (typeof snakeVal === 'boolean') return snakeVal;
  const camelVal = source[camel];
  if (typeof camelVal === 'boolean') return camelVal;
  return undefined;
}

/** Group setting: hide forward / save for non-admins when true. */
export function isRestrictSavingContent(chat: ChatSummary | null | undefined): boolean {
  if (!chat) return false;
  const asRecord = chat as ChatSummary & Record<string, unknown>;
  return (
    readBool(asRecord, 'restrict_saving_content', 'restrictSavingContent') === true
  );
}

export function getMyMembership(chat: ChatSummary | null | undefined, userId: string | undefined) {
  if (!chat?.members?.length || !userId) return undefined;
  return chat.members.find((m) => m.user_id === userId);
}

export function isGroupAdmin(
  chat: ChatSummary | null | undefined,
  userId: string | undefined,
): boolean {
  const role = getMyMembership(chat, userId)?.role;
  return role === 'owner' || role === 'admin';
}

function asPermRecord(
  value:
    | Partial<GroupPermissions>
    | Partial<GroupMemberPermissions>
    | Partial<EffectiveGroupPermissions>
    | Record<string, boolean>
    | null
    | undefined,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

/**
 * Prefer server `my_permissions` (effective), then member defaults / legacy aliases.
 */
function resolveGroupPermission(
  chat: ChatSummary,
  key: keyof GroupPermissions,
): boolean | undefined {
  const sources = [
    asPermRecord(chat.my_permissions),
    asPermRecord(chat.member_permissions),
    asPermRecord(chat.group_permissions),
    asPermRecord(chat.default_permissions),
  ];
  for (const source of sources) {
    const value = source?.[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function hasMyPermissions(chat: ChatSummary): boolean {
  return chat.my_permissions != null && typeof chat.my_permissions === 'object';
}

/**
 * Pin: private always; groups use my_permissions.can_pin_messages.
 * When flags absent on groups → admin/owner fallback, else deny (server member default).
 */
export function canPinMessages(
  chat: ChatSummary | null | undefined,
  user: ChatPermissionUser,
): boolean {
  if (!chat || !user?.id) return false;
  if (chat.chat_type === 'private') return true;
  if (chat.chat_type === 'channel') {
    return isGroupAdmin(chat, user.id) || chat.can_post === true;
  }
  const allowed = resolveGroupPermission(chat, 'can_pin_messages');
  if (typeof allowed === 'boolean') return allowed;
  return isGroupAdmin(chat, user.id);
}

/**
 * Forward/save: blocked when restrictSavingContent and no bypass.
 * Once my_permissions exists, trust can_restrict_saving_bypass (no fail-open).
 */
export function canSaveOrForwardContent(
  chat: ChatSummary | null | undefined,
  user: ChatPermissionUser,
): boolean {
  if (!chat) return true;
  if (!isRestrictSavingContent(chat)) return true;
  if (!user?.id) return false;
  if (chat.chat_type === 'private') return true;

  if (hasMyPermissions(chat)) {
    return chat.my_permissions?.can_restrict_saving_bypass === true;
  }
  if (isGroupAdmin(chat, user.id)) return true;
  // Legacy: members list present without my_permissions → only admins bypass.
  if (chat.members?.length) return false;
  // No permission payload at all → fail open until settings land on this chat.
  return true;
}

export function restrictSavingReason(): string {
  return 'В этой группе запрещено сохранять и пересылать контент';
}

/**
 * Create polls: groups only (server API). Use my_permissions / member defaults.
 * Absent flags → allow (server member default is true).
 */
export function canCreatePolls(
  chat: ChatSummary | null | undefined,
  user: ChatPermissionUser,
): boolean {
  if (!chat || !user?.id) return false;
  if (chat.chat_type !== 'group') return false;
  const allowed = resolveGroupPermission(chat, 'can_create_polls');
  if (typeof allowed === 'boolean') return allowed;
  return true;
}

import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import {
  telegramAccountStore,
  type TelegramChatType,
  type TelegramDialogRow,
} from '../../stores/telegramAccountStore';
import { buildChatRowLoadFailure } from './telegramDialogFallback';
import { buildDialogPreviewFromChat, previewTextFromChat } from './telegramDialogPreview';
import { scheduleTopTelegramChatsPreload } from './telegramChatPreload';

export function matchesDialogQuery(row: TelegramDialogRow, normalizedQuery: string) {
  const typeLabel =
    row.chatType === 'channel'
      ? 'канал channel'
      : row.chatType === 'group' || row.chatType === 'supergroup'
        ? 'группа group'
        : '';
  const haystack = [
    typeof row.title === 'string' ? row.title : '',
    typeof row.lastMessagePreview === 'string' ? row.lastMessagePreview : '',
    typeLabel,
  ]
    .filter((part) => part.length > 0)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function titleFromChat(chat: Record<string, unknown>, chatId: number): string {
  const t = typeof chat.title === 'string' ? chat.title.trim() : '';
  if (t) return t;
  return `Чат ${chatId}`;
}

function parseChatType(chat: Record<string, unknown>): {
  chatType: TelegramChatType;
  supergroupId?: number;
  basicGroupId?: number;
} {
  const type = getNestedRecord(chat.type);
  const kind = type?.['@type'];
  if (kind === 'chatTypeSupergroup') {
    const isChannel = type?.is_channel === true;
    const supergroupId = typeof type?.supergroup_id === 'number' ? type.supergroup_id : undefined;
    return { chatType: isChannel ? 'channel' : 'supergroup', supergroupId };
  }
  if (kind === 'chatTypeBasicGroup') {
    const basicGroupId = typeof type?.basic_group_id === 'number' ? type.basic_group_id : undefined;
    return { chatType: 'group', basicGroupId };
  }
  if (kind === 'chatTypeSecret') return { chatType: 'secret' };
  return { chatType: 'private' };
}

function getChatAvatarFileId(chat: Record<string, unknown>): number | null {
  const photo = getNestedRecord(chat.photo);
  const small = getNestedRecord(photo?.small);
  const id = small?.id;
  return typeof id === 'number' ? id : null;
}

async function getLocalFilePath(fileId: number): Promise<string | null> {
  const downloaded = (await tdlibClient.send({
    '@type': 'downloadFile',
    file_id: fileId,
    priority: 1,
    offset: 0,
    limit: 0,
    synchronous: true,
  })) as Record<string, unknown>;
  throwIfTdError(downloaded);
  const local = getNestedRecord(downloaded.local);
  const path = typeof local?.path === 'string' ? local.path.trim() : '';
  return path ? `file://${path}` : null;
}

async function loadMemberCount(
  supergroupId?: number,
  basicGroupId?: number,
): Promise<number | undefined> {
  try {
    if (supergroupId != null) {
      const sg = (await tdlibClient.send({
        '@type': 'getSupergroup',
        supergroup_id: supergroupId,
      })) as Record<string, unknown>;
      throwIfTdError(sg);
      const n = sg.member_count;
      return typeof n === 'number' ? n : undefined;
    }
    if (basicGroupId != null) {
      const bg = (await tdlibClient.send({
        '@type': 'getBasicGroup',
        basic_group_id: basicGroupId,
      })) as Record<string, unknown>;
      throwIfTdError(bg);
      const n = bg.member_count;
      return typeof n === 'number' ? n : undefined;
    }
  } catch {
    /* member count is best-effort */
  }
  return undefined;
}

export async function loadChatRow(
  chatId: number,
  previous?: TelegramDialogRow,
): Promise<TelegramDialogRow> {
  try {
    const chat = (await tdlibClient.send({
      '@type': 'getChat',
      chat_id: chatId,
    })) as Record<string, unknown>;
    throwIfTdError(chat);
    const idStr = String(chatId);
    const last = getNestedRecord(chat.last_message);
    const date = typeof last?.date === 'number' ? last.date * 1000 : null;
    const unreadCount = typeof chat.unread_count === 'number' ? chat.unread_count : 0;
    const avatarFileId = getChatAvatarFileId(chat);
    const { chatType, supergroupId, basicGroupId } = parseChatType(chat);
    const [avatarUri, memberCount, dialogPreview] = await Promise.all([
      avatarFileId != null ? getLocalFilePath(avatarFileId).catch(() => null) : Promise.resolve(null),
      loadMemberCount(supergroupId, basicGroupId),
      buildDialogPreviewFromChat(chat, chatId).catch(() => ({
        text: previewTextFromChat(chat),
        thumbnailUris: previous?.lastMessageThumbnailUris ?? [],
        accentLabel: previous?.lastMessagePreviewAccent ?? false,
      })),
    ]);
    return {
      id: idStr,
      chatId: idStr,
      title: titleFromChat(chat, chatId),
      lastMessagePreview: dialogPreview.text,
      lastMessageThumbnailUris: dialogPreview.thumbnailUris,
      lastMessagePreviewAccent: dialogPreview.accentLabel,
      avatarUri,
      lastMessageAt: date,
      unreadCount,
      chatType,
      memberCount,
      isPinned: Array.isArray(chat.positions) && chat.positions.some((p: any) => p?.list?.['@type'] === 'chatListMain' && p?.is_pinned === true),
    };
  } catch {
    return buildChatRowLoadFailure(chatId, previous);
  }
}

export async function refreshTelegramDialogs(): Promise<void> {
  try {
    await applyTdlibParameters();
    const { ready, state } = await waitForTdlibAuthorizationReady();
    if (!ready) {
      if (state === 'authorizationStateWaitPassword') {
        telegramAccountStore.getState().setAuthStatus('waiting_password');
      }
      const hint =
        state === 'authorizationStateWaitPhoneNumber' || state === 'authorizationStateWaitCode'
          ? 'Нужна авторизация Telegram: Настройки → Telegram.'
          : state === 'authorizationStateWaitPassword'
            ? 'Нужен облачный пароль 2FA: Настройки → Telegram, введите пароль из настроек Telegram.'
            : `Сессия TDLib не готова (${state ?? 'таймаут'}). Потяните список вниз.`;
      telegramAccountStore.getState().setLastError(hint);
      telegramAccountStore.getState().setDialogs([]);
      await telegramAccountStore.getState().persistSnapshot();
      return;
    }
    const res = (await tdlibClient.send({
      '@type': 'getChats',
      chat_list: { '@type': 'chatListMain' },
      limit: 80,
    })) as Record<string, unknown>;
    throwIfTdError(res);
    if (res['@type'] !== 'chats') {
      telegramAccountStore
        .getState()
        .setLastError(`Ожидался chats, пришло: ${String(res['@type'])}`);
      return;
    }
    const rawIds = res.chat_ids as unknown;
    const ids = Array.isArray(rawIds)
      ? rawIds
          .map((x) => (typeof x === 'number' ? x : Number.parseInt(String(x), 10)))
          .filter((n) => Number.isFinite(n))
      : [];
    if (ids.length === 0) {
      telegramAccountStore.getState().setDialogs([]);
      await telegramAccountStore.getState().persistSnapshot();
      return;
    }
    const prevByChatId = new Map(
      telegramAccountStore.getState().dialogs.map((r) => [r.chatId, r] as const),
    );
    const rows: TelegramDialogRow[] = [];
    const batch = 6;
    for (let i = 0; i < ids.length; i += batch) {
      const slice = ids.slice(i, i + batch);
      const part = await Promise.all(
        slice.map((id) => loadChatRow(id, prevByChatId.get(String(id)))),
      );
      rows.push(...part);
    }
    telegramAccountStore.getState().setDialogs(rows);
    telegramAccountStore.getState().setLastError(null);
    await telegramAccountStore.getState().persistSnapshot();
    scheduleTopTelegramChatsPreload(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    telegramAccountStore.getState().setLastError(msg);
  }
}

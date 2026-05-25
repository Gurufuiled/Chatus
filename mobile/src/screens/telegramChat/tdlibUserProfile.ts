import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import { downloadTdlibFile, getNestedRecord } from './tdlibMapping';
import { getTdlibChatPhotoFileId } from './tdlibPhotoUtils';

export type TelegramPeerResolution =
  | { kind: 'user'; userId: number }
  | { kind: 'secret'; userId: number }
  | { kind: 'supergroup'; supergroupId: number; isChannel: boolean }
  | { kind: 'basicGroup'; basicGroupId: number }
  | { kind: 'unknown' };

export async function tdlibResolveChatPeer(chatId: number): Promise<TelegramPeerResolution> {
  const chat = (await tdlibClient.send({
    '@type': 'getChat',
    chat_id: chatId,
  })) as Record<string, unknown>;
  throwIfTdError(chat);
  const t = getNestedRecord(chat.type);
  const typ = t?.['@type'];
  if (typ === 'chatTypePrivate') {
    const userId = typeof t.user_id === 'number' ? t.user_id : null;
    return userId != null ? { kind: 'user', userId } : { kind: 'unknown' };
  }
  if (typ === 'chatTypeSecret') {
    const userId = typeof t.user_id === 'number' ? t.user_id : null;
    return userId != null ? { kind: 'secret', userId } : { kind: 'unknown' };
  }
  if (typ === 'chatTypeSupergroup') {
    const supergroupId = typeof t.supergroup_id === 'number' ? t.supergroup_id : null;
    const isChannel = t.is_channel === true;
    return supergroupId != null
      ? { kind: 'supergroup', supergroupId, isChannel }
      : { kind: 'unknown' };
  }
  if (typ === 'chatTypeBasicGroup') {
    const basicGroupId = typeof t.basic_group_id === 'number' ? t.basic_group_id : null;
    return basicGroupId != null ? { kind: 'basicGroup', basicGroupId } : { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

export function formatTdUserStatus(status: Record<string, unknown> | null | undefined): string {
  if (!status) return 'был(а) недавно';
  const t = status['@type'];
  if (t === 'userStatusOnline') return 'в сети';
  if (t === 'userStatusRecently') return 'был(а) недавно';
  if (t === 'userStatusLastWeek') return 'был(а) на этой неделе';
  if (t === 'userStatusLastMonth') return 'был(а) в этом месяце';
  if (t === 'userStatusOffline') {
    const was = typeof status.was_online === 'number' ? status.was_online : 0;
    if (was <= 0) return 'не в сети';
    const d = new Date(was * 1000);
    return `был(а) ${d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
  return 'был(а) недавно';
}

export async function fetchTdlibUserAvatarUri(user: Record<string, unknown>): Promise<string | null> {
  const photo = getNestedRecord(user.profile_photo);
  if (!photo) return null;
  const big = getNestedRecord(photo.big);
  const small = getNestedRecord(photo.small);
  const file = big ?? small;
  const fid = typeof file?.id === 'number' ? file.id : null;
  if (fid == null) return null;
  return downloadTdlibFile(fid).catch(() => null);
}

/** Avatar from `chat.photo` (groups, supergroups, channels). */
export async function fetchTdlibChatPhotoUri(chat: Record<string, unknown>): Promise<string | null> {
  const fid = getTdlibChatPhotoFileId(chat);
  if (fid == null) return null;
  return downloadTdlibFile(fid).catch(() => null);
}

export function isTdChatMuted(chat: Record<string, unknown>): boolean {
  const ns = getNestedRecord(chat.notification_settings);
  const muteFor = ns?.mute_for;
  return typeof muteFor === 'number' && muteFor > 0;
}

export async function tdlibIsUserBlocked(userId: number): Promise<boolean> {
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 10; page += 1) {
    const res = (await tdlibClient.send({
      '@type': 'getBlockedMessageSenders',
      block_list: { '@type': 'blockListMain' },
      offset,
      limit,
    })) as Record<string, unknown>;
    throwIfTdError(res);

    const senders = Array.isArray(res.senders) ? res.senders : [];
    for (const sender of senders) {
      const s = getNestedRecord(sender);
      if (s?.['@type'] === 'messageSenderUser' && s.user_id === userId) {
        return true;
      }
    }

    if (senders.length < limit) return false;
    offset += senders.length;
  }
  return false;
}

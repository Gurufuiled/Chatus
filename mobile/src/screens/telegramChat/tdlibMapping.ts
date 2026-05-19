import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import {
  getCachedUserAvatarUri,
  getCachedUserName,
  setCachedUserAvatarUri,
  setCachedUserName,
} from '../../services/tdlib/userNameCache';
import { previewForUnsupported } from './composer';
import type { TelegramMessageRow, TelegramMessageStatus } from './types';

export type MapTdMessageOptions = {
  /** When true, fetch sender profile photo for incoming user messages (group / supergroup UI). */
  loadSenderAvatar?: boolean;
};

export function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function getPinnedMessageIdFromChat(chat: Record<string, unknown>): number | null {
  const direct = chat.pinned_message_id;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const pm = getNestedRecord(chat.pinned_message);
  const id = pm?.id;
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
    return id;
  }
  return null;
}

function getMessageId(raw: Record<string, unknown>): number | null {
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  return Number.isFinite(id) ? id : null;
}

export function getTdMessageStatus(
  raw: Record<string, unknown>,
  lastReadOutboxMessageId: number,
): TelegramMessageStatus {
  if (raw.is_outgoing !== true) return 'sent';

  const sendingState = getNestedRecord(raw.sending_state);
  const sendingStateType = sendingState?.['@type'];
  if (sendingStateType === 'messageSendingStatePending') return 'sending';
  if (sendingStateType === 'messageSendingStateFailed') return 'failed';

  const id = getMessageId(raw);
  if (id != null && id > 0 && lastReadOutboxMessageId > 0 && id <= lastReadOutboxMessageId) {
    return 'read';
  }

  return 'sent';
}

export function getLastReadOutboxMessageId(value: Record<string, unknown>): number {
  const raw = value.last_read_outbox_message_id;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

export function getReplyToMessageId(raw: Record<string, unknown>): number | null {
  const replyTo = getNestedRecord(raw.reply_to);
  if (replyTo?.['@type'] !== 'messageReplyToMessage') return null;

  const messageId = replyTo.message_id;
  return typeof messageId === 'number' && Number.isFinite(messageId) && messageId > 0 ? messageId : null;
}

function getFormattedText(value: unknown): string {
  const text = getNestedRecord(value);
  return typeof text?.text === 'string' ? text.text : '';
}

function getTdFileLocalUri(file: Record<string, unknown> | null): string | null {
  const local = getNestedRecord(file?.local);
  const path = typeof local?.path === 'string' ? local.path.trim() : '';
  return path ? `file://${path}` : null;
}

function getTdFileId(file: Record<string, unknown> | null): number | null {
  const id = file?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

async function resolveTdFileUri(file: Record<string, unknown> | null): Promise<string | null> {
  const localUri = getTdFileLocalUri(file);
  if (localUri) return localUri;

  const fileId = getTdFileId(file);
  return fileId != null ? await downloadTdlibFile(fileId).catch(() => null) : null;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getLargestPhotoSize(photo: Record<string, unknown> | null): Record<string, unknown> | null {
  const sizes = Array.isArray(photo?.sizes) ? photo.sizes : [];
  let largest: Record<string, unknown> | null = null;
  let largestArea = 0;

  for (const item of sizes) {
    const size = getNestedRecord(item);
    if (!size) continue;
    const file = getNestedRecord(size.photo);
    if (!file) continue;
    const width = getNumber(size.width) ?? 0;
    const height = getNumber(size.height) ?? 0;
    const area = width * height;
    if (!largest || area > largestArea) {
      largest = size;
      largestArea = area;
    }
  }

  return largest;
}

export async function downloadTdlibFile(fileId: number): Promise<string | null> {
  const file = (await tdlibClient.send({
    '@type': 'downloadFile',
    file_id: fileId,
    priority: 1,
    offset: 0,
    limit: 0,
    synchronous: true,
  })) as Record<string, unknown>;
  throwIfTdError(file);
  const local = getNestedRecord(file.local);
  const path = typeof local?.path === 'string' ? local.path.trim() : '';
  return path ? `file://${path}` : null;
}

async function fetchTdlibUserProfilePhotoUri(user: Record<string, unknown>): Promise<string | null> {
  const photo = getNestedRecord(user.profile_photo);
  if (!photo) return null;
  const big = getNestedRecord(photo.big);
  const small = getNestedRecord(photo.small);
  const file = big ?? small;
  const fid = typeof file?.id === 'number' ? file.id : null;
  if (fid == null) return null;
  return downloadTdlibFile(fid).catch(() => null);
}

async function resolveIncomingUserSender(
  raw: Record<string, unknown>,
  loadAvatar: boolean,
): Promise<{ userId: number; name: string; avatarUri: string | null | undefined } | null> {
  if (raw.is_outgoing === true) return null;
  const sender = getNestedRecord(raw.sender_id);
  if (!sender || sender['@type'] !== 'messageSenderUser') return null;
  const userId = typeof sender.user_id === 'number' ? sender.user_id : null;
  if (userId == null) return null;

  const cachedName = getCachedUserName(userId);
  const cachedAvatarState = loadAvatar ? getCachedUserAvatarUri(userId) : undefined;

  const canSkipNetwork =
    !!cachedName && (!loadAvatar || cachedAvatarState !== undefined);

  if (canSkipNetwork) {
    return {
      userId,
      name: cachedName,
      avatarUri: loadAvatar ? cachedAvatarState ?? null : undefined,
    };
  }

  try {
    const user = (await tdlibClient.send({
      '@type': 'getUser',
      user_id: userId,
    })) as Record<string, unknown>;
    throwIfTdError(user);
    const firstName = typeof user.first_name === 'string' ? user.first_name.trim() : '';
    const lastName = typeof user.last_name === 'string' ? user.last_name.trim() : '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || `User ${userId}`;
    setCachedUserName(userId, name);

    let avatarUri: string | null | undefined;
    if (loadAvatar) {
      const downloaded = await fetchTdlibUserProfilePhotoUri(user);
      avatarUri = downloaded;
      setCachedUserAvatarUri(userId, downloaded);
    }

    return { userId, name, avatarUri: loadAvatar ? avatarUri ?? null : undefined };
  } catch {
    const fallbackName = cachedName ?? `User ${userId}`;
    return {
      userId,
      name: fallbackName,
      avatarUri: loadAvatar
        ? cachedAvatarState !== undefined
          ? cachedAvatarState ?? null
          : null
        : undefined,
    };
  }
}

function getTdViewCount(raw: Record<string, unknown>): number | undefined {
  const info = getNestedRecord(raw.interaction_info);
  const count = info?.view_count;
  return typeof count === 'number' && count > 0 ? count : undefined;
}

/** Channel post → linked discussion group + comment thread (TDLib `Message`). */
function getTdDiscussionFields(raw: Record<string, unknown>): {
  discussionReplyCount?: number;
  discussionChatId?: number;
  messageThreadId?: number;
} {
  const interaction = getNestedRecord(raw.interaction_info);
  const replyInfo = getNestedRecord(interaction?.reply_info);
  const rc = replyInfo?.reply_count;
  const discussionReplyCount =
    typeof rc === 'number' && Number.isFinite(rc) && rc >= 0 ? rc : undefined;

  const ric = raw.reply_in_chat_id;
  const discussionChatId =
    typeof ric === 'number' && Number.isFinite(ric) && ric !== 0 ? ric : undefined;

  const mtid = raw.message_thread_id;
  const messageThreadId =
    typeof mtid === 'number' && Number.isFinite(mtid) && mtid !== 0 ? mtid : undefined;

  return { discussionReplyCount, discussionChatId, messageThreadId };
}

export async function loadLastReadOutboxMessageId(chatId: number): Promise<number> {
  const chat = (await tdlibClient.send({
    '@type': 'getChat',
    chat_id: chatId,
  })) as Record<string, unknown>;
  throwIfTdError(chat);
  return getLastReadOutboxMessageId(chat);
}

export async function mapTdMessages(
  rawMessages: Record<string, unknown>[],
  lastReadOutboxMessageId: number,
  concurrency = 4,
  options?: MapTdMessageOptions,
): Promise<TelegramMessageRow[]> {
  const mapped: Array<TelegramMessageRow | null> = new Array(rawMessages.length).fill(null);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < rawMessages.length) {
      const index = nextIndex;
      nextIndex += 1;
      const row = await mapTdMessage(rawMessages[index], lastReadOutboxMessageId, options);
      mapped[index] = row;
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, rawMessages.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return mapped.filter((item): item is TelegramMessageRow => item != null);
}

export async function mapTdMessage(
  raw: Record<string, unknown>,
  lastReadOutboxMessageId: number,
  options?: MapTdMessageOptions,
): Promise<TelegramMessageRow | null> {
  const id = getMessageId(raw);
  if (id == null) return null;
  const content = getNestedRecord(raw.content);
  const kind = content?.['@type'] as string | undefined;
  const outgoing = raw.is_outgoing === true;
  const dateSec = typeof raw.date === 'number' ? raw.date : Math.floor(Date.now() / 1000);
  const caption = getFormattedText(content?.caption);
  const loadAvatar = options?.loadSenderAvatar === true;
  const incomingSender = await resolveIncomingUserSender(raw, loadAvatar);
  const senderName = outgoing ? undefined : incomingSender?.name;
  const senderUserId = outgoing ? undefined : incomingSender?.userId;
  const senderAvatarUri =
    outgoing || !loadAvatar ? undefined : incomingSender?.avatarUri;
  const viewCount = getTdViewCount(raw);
  const { discussionReplyCount, discussionChatId, messageThreadId } = getTdDiscussionFields(raw);
  const base = {
    id: String(id),
    messageId: id,
    outgoing,
    dateMs: dateSec * 1000,
    status: getTdMessageStatus(raw, lastReadOutboxMessageId),
    replyToMessageId: getReplyToMessageId(raw),
    senderName: senderName ?? undefined,
    senderUserId,
    senderAvatarUri: senderAvatarUri !== undefined ? senderAvatarUri : undefined,
    viewCount,
    discussionReplyCount,
    discussionChatId,
    messageThreadId,
  };

  if (kind === 'messageText') {
    return {
      ...base,
      kind: 'text',
      text: getFormattedText(content.text),
    };
  }

  if (kind === 'messageVoiceNote') {
    const voiceNote = getNestedRecord(content.voice_note);
    const voice = getNestedRecord(voiceNote?.voice);
    const local = getNestedRecord(voice?.local);
    const localPath = typeof local?.path === 'string' ? local.path.trim() : '';
    const fileId = typeof voice?.id === 'number' ? voice.id : null;
    const uri =
      localPath ? `file://${localPath}` : fileId != null ? await downloadTdlibFile(fileId).catch(() => null) : null;
    const duration = typeof voiceNote?.duration === 'number' ? voiceNote.duration * 1000 : 0;
    return {
      ...base,
      kind: 'voice',
      text: 'Голосовое',
      voiceUri: uri,
      durationMs: duration,
      waveform: [],
    };
  }

  if (kind === 'messagePhoto') {
    const photo = getNestedRecord(content.photo);
    const largest = getLargestPhotoSize(photo);
    const file = getNestedRecord(largest?.photo);
    const uri = await resolveTdFileUri(file);
    return {
      ...base,
      kind: uri ? 'image' : 'service',
      text: uri ? caption : caption || 'Фото',
      mediaUri: uri,
      width: getNumber(largest?.width),
      height: getNumber(largest?.height),
    };
  }

  if (kind === 'messageVideo') {
    const video = getNestedRecord(content.video);
    const file = getNestedRecord(video?.video);
    const thumbnail = getNestedRecord(video?.thumbnail);
    const thumbnailFile = getNestedRecord(thumbnail?.file);
    const [uri, thumbnailUri] = await Promise.all([resolveTdFileUri(file), resolveTdFileUri(thumbnailFile)]);
    return {
      ...base,
      kind: uri ? 'video' : 'service',
      text: uri ? caption : caption || 'Видео',
      mediaUri: uri,
      thumbnailUri,
      width: getNumber(video?.width),
      height: getNumber(video?.height),
      durationMs: (getNumber(video?.duration) ?? 0) * 1000,
    };
  }

  if (kind === 'messageVideoNote') {
    const videoNote = getNestedRecord(content.video_note);
    const file = getNestedRecord(videoNote?.video);
    const thumbnail = getNestedRecord(videoNote?.thumbnail);
    const thumbnailFile = getNestedRecord(thumbnail?.file);
    const mini = getNestedRecord(videoNote?.minithumbnail);
    const miniData = typeof mini?.data === 'string' && mini.data.length > 8 ? mini.data : null;
    const miniUri = miniData ? `data:image/jpeg;base64,${miniData}` : null;
    const [uri, thumbnailUri] = await Promise.all([
      resolveTdFileUri(file),
      resolveTdFileUri(thumbnailFile),
    ]);
    const side = getNumber(videoNote?.length);
    return {
      ...base,
      kind: uri ? 'video_note' : 'service',
      text: 'Видеосообщение',
      mediaUri: uri,
      thumbnailUri: thumbnailUri ?? miniUri,
      width: side,
      height: side,
      durationMs: (getNumber(videoNote?.duration) ?? 0) * 1000,
    };
  }

  if (kind === 'messageDocument') {
    const document = getNestedRecord(content.document);
    const file = getNestedRecord(document?.document);
    const uri = await resolveTdFileUri(file);
    return {
      ...base,
      kind: 'file',
      text: caption,
      mediaUri: uri,
      fileName: typeof document?.file_name === 'string' ? document.file_name : 'File',
      fileSize: getNumber(file?.size) ?? getNumber(file?.expected_size),
    };
  }

  return {
    ...base,
    kind: 'service',
    text: previewForUnsupported(kind),
  };
}

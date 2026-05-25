import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import {
  getCachedUserAvatarUri,
  getCachedUserName,
  setCachedUserAvatarUri,
  setCachedUserName,
} from '../../services/tdlib/userNameCache';
import { previewForUnsupported } from './composer';
import { getTdMediaAlbumId, mergeTelegramFeedRows } from './telegramAlbumRows';
import type {
  TelegramAlbumMediaItem,
  TelegramMessageRow,
  TelegramMessageStatus,
  TelegramWebPagePreview,
} from './types';

export type MapTdMessageOptions = {
  /** When true, fetch sender profile photo for incoming user messages (group / supergroup UI). */
  loadSenderAvatar?: boolean;
  /** History list: use only TDLib local paths, do not block on `downloadFile`. */
  mediaLocalOnly?: boolean;
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

async function resolveTdFileUri(
  file: Record<string, unknown> | null,
  mediaLocalOnly = false,
): Promise<string | null> {
  const localUri = getTdFileLocalUri(file);
  if (localUri) return localUri;
  if (mediaLocalOnly) return null;

  const fileId = getTdFileId(file);
  if (fileId != null) {
    scheduleTdlibFileDownload(fileId);
  }
  return null;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type PhotoSizeEntry = {
  size: Record<string, unknown>;
  file: Record<string, unknown>;
  area: number;
};

function listPhotoSizes(photo: Record<string, unknown> | null): PhotoSizeEntry[] {
  const sizes = Array.isArray(photo?.sizes) ? photo.sizes : [];
  const parsed: PhotoSizeEntry[] = [];
  for (const item of sizes) {
    const size = getNestedRecord(item);
    if (!size) continue;
    const file = getNestedRecord(size.photo) ?? getNestedRecord(size.file);
    if (!file) continue;
    const width = getNumber(size.width) ?? 0;
    const height = getNumber(size.height) ?? 0;
    const area = width > 0 && height > 0 ? width * height : 1;
    parsed.push({ size, file, area });
  }
  return parsed;
}

function minithumbnailDataUri(photo: Record<string, unknown> | null): string | null {
  const mini = getNestedRecord(photo?.minithumbnail);
  const data = mini?.data;
  if (typeof data === 'string' && data.length > 8) {
    return `data:image/jpeg;base64,${data}`;
  }
  return null;
}

export type ResolvedPhoto = {
  uri: string | null;
  width?: number;
  height?: number;
  /** Largest photo file still downloading; UI shows loader until `updateFile`. */
  fullFileId?: number;
};

export function scheduleTdlibFileDownload(fileId: number, priority = 16): void {
  void tdlibClient
    .send({
      '@type': 'downloadFile',
      file_id: fileId,
      priority,
      offset: 0,
      limit: 0,
      synchronous: false,
    })
    .catch(() => undefined);
}

/** Largest cached file first; preview + async full download when only mini is available. */
async function resolvePhotoUri(
  photo: Record<string, unknown> | null,
  mediaLocalOnly: boolean,
): Promise<ResolvedPhoto> {
  const sizesDesc = listPhotoSizes(photo).sort((a, b) => b.area - a.area);
  const largest = sizesDesc[0];
  const displayWidth = largest ? getNumber(largest.size.width) : undefined;
  const displayHeight = largest ? getNumber(largest.size.height) : undefined;
  const fullFileId = largest ? getTdFileId(largest.file) ?? undefined : undefined;

  for (const { size, file } of sizesDesc) {
    const localUri = getTdFileLocalUri(file);
    if (localUri) {
      const localFileId = getTdFileId(file);
      const isLargest = localFileId != null && localFileId === fullFileId;
      if (!isLargest && fullFileId != null && !mediaLocalOnly) {
        scheduleTdlibFileDownload(fullFileId);
        return {
          uri: localUri,
          width: getNumber(size.width) ?? displayWidth,
          height: getNumber(size.height) ?? displayHeight,
          fullFileId,
        };
      }
      return {
        uri: localUri,
        width: getNumber(size.width) ?? displayWidth,
        height: getNumber(size.height) ?? displayHeight,
      };
    }
  }

  const miniUri = minithumbnailDataUri(photo);

  if (mediaLocalOnly) {
    if (miniUri) {
      return { uri: miniUri, width: displayWidth, height: displayHeight, fullFileId };
    }
    return { uri: null, width: displayWidth, height: displayHeight, fullFileId };
  }

  for (const { size, file } of sizesDesc) {
    const uri = await resolveTdFileUri(file, false);
    if (uri) {
      return {
        uri,
        width: getNumber(size.width) ?? displayWidth,
        height: getNumber(size.height) ?? displayHeight,
      };
    }
  }

  if (fullFileId != null) {
    scheduleTdlibFileDownload(fullFileId);
  }
  if (miniUri) {
    return { uri: miniUri, width: displayWidth, height: displayHeight, fullFileId };
  }

  return { uri: null, width: displayWidth, height: displayHeight, fullFileId };
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
  const file = small ?? big; // Use small for chat feed
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

export async function parseWebPagePreview(
  webPage: Record<string, unknown> | null,
  mediaLocalOnly: boolean,
): Promise<TelegramWebPagePreview | null> {
  if (!webPage || typeof webPage.url !== 'string') return null;
  const descRaw = getNestedRecord(webPage.description);
  const description = typeof descRaw?.text === 'string' ? descRaw.text : undefined;
  
  const photo = getNestedRecord(webPage.photo);
  let photoUri: string | null = null;
  let photoWidth = 0;
  let photoHeight = 0;
  
  let photoFileId: number | undefined;
  if (photo) {
    const parsed = await resolvePhotoUri(photo, mediaLocalOnly);
    if (parsed.uri) {
      photoUri = parsed.uri;
      photoWidth = parsed.width ?? 0;
      photoHeight = parsed.height ?? 0;
    }
    photoFileId = parsed.fullFileId;
  }

  return {
    url: webPage.url,
    siteName: typeof webPage.site_name === 'string' ? webPage.site_name : undefined,
    title: typeof webPage.title === 'string' ? webPage.title : undefined,
    description,
    photoUri,
    photoWidth,
    photoHeight,
    photoFileId,
  };
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
  const mediaLocalOnly = options?.mediaLocalOnly === true;
  const incomingSender = await resolveIncomingUserSender(raw, loadAvatar);
  const senderName = outgoing ? undefined : incomingSender?.name;
  const senderUserId = outgoing ? undefined : incomingSender?.userId;
  const senderAvatarUri =
    outgoing || !loadAvatar ? undefined : incomingSender?.avatarUri;
  const viewCount = getTdViewCount(raw);
  const { discussionReplyCount, discussionChatId, messageThreadId } = getTdDiscussionFields(raw);
  const mediaAlbumId = getTdMediaAlbumId(raw);
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
    mediaAlbumId,
  };

  if (kind === 'messageText') {
    const webPageRaw = getNestedRecord(content.web_page);
    const webPagePreview = webPageRaw ? await parseWebPagePreview(webPageRaw, mediaLocalOnly) : null;
    return {
      ...base,
      kind: 'text',
      text: getFormattedText(content.text),
      webPagePreview,
    };
  }

  if (kind === 'messageVoiceNote') {
    const voiceNote = getNestedRecord(content.voice_note);
    const voice = getNestedRecord(voiceNote?.voice);
    const local = getNestedRecord(voice?.local);
    const localPath = typeof local?.path === 'string' ? local.path.trim() : '';
    const fileId = typeof voice?.id === 'number' ? voice.id : null;
    const uri = localPath ? `file://${localPath}` : null;
    const duration = typeof voiceNote?.duration === 'number' ? voiceNote.duration * 1000 : 0;
    if (!uri && fileId != null && !mediaLocalOnly) {
      scheduleTdlibFileDownload(fileId);
    }
    return {
      ...base,
      kind: 'voice',
      text: 'Голосовое',
      voiceUri: uri,
      mediaFullFileId: uri ? undefined : (fileId ?? undefined),
      durationMs: duration,
      waveform: [],
    };
  }

  if (kind === 'messagePhoto') {
    const photo = getNestedRecord(content.photo);
    const resolved = await resolvePhotoUri(photo, mediaLocalOnly);
    const uri = resolved.uri;
    const hasLocalFile = typeof uri === 'string' && uri.startsWith('file://');
    return {
      ...base,
      kind: 'image',
      text: caption || (uri ? '' : 'Фото'),
      mediaUri: uri ?? undefined,
      mediaFullFileId: resolved.fullFileId,
      width: resolved.width,
      height: resolved.height,
    };
  }

  if (kind === 'messageVideo') {
    const video = getNestedRecord(content.video);
    const file = getNestedRecord(video?.video);
    const thumbnail = getNestedRecord(video?.thumbnail);
    const thumbnailFile = getNestedRecord(thumbnail?.file);
    const [uri, thumbnailUri] = await Promise.all([
      resolveTdFileUri(file, mediaLocalOnly),
      resolveTdFileUri(thumbnailFile, mediaLocalOnly),
    ]);
    return {
      ...base,
      kind: 'video',
      text: caption || (uri ? '' : 'Видео'),
      mediaUri: uri ?? undefined,
      thumbnailUri: thumbnailUri ?? undefined,
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
      resolveTdFileUri(file, mediaLocalOnly),
      resolveTdFileUri(thumbnailFile, mediaLocalOnly),
    ]);
    const side = getNumber(videoNote?.length);
    return {
      ...base,
      kind: 'video_note',
      text: 'Видеосообщение',
      mediaUri: uri ?? undefined,
      thumbnailUri: thumbnailUri ?? miniUri ?? undefined,
      width: side,
      height: side,
      durationMs: (getNumber(videoNote?.duration) ?? 0) * 1000,
    };
  }

  if (kind === 'messageDocument') {
    const document = getNestedRecord(content.document);
    const file = getNestedRecord(document?.document);
    const uri = await resolveTdFileUri(file, mediaLocalOnly);
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

function albumItemHasUri(item: TelegramAlbumMediaItem): boolean {
  if (item.kind === 'image') return !!item.mediaUri?.trim();
  return !!(item.thumbnailUri?.trim() || item.mediaUri?.trim());
}

function imageRowNeedsHydrate(row: TelegramMessageRow): boolean {
  if (row.kind !== 'image' || row.messageId <= 0) return false;
  const uri = row.mediaUri?.trim() ?? '';
  if (!uri || row.mediaFullFileId != null) return true;
  return false;
}

function collectMediaHydrateMessageIds(rows: TelegramMessageRow[]): number[] {
  const missingIds = new Set<number>();
  for (const row of rows) {
    if (row.kind === 'album') {
      for (const item of row.albumMedia ?? []) {
        if (item.messageId > 0 && (!albumItemHasUri(item) || item.mediaFullFileId != null)) {
          missingIds.add(item.messageId);
        }
      }
      continue;
    }
    if (imageRowNeedsHydrate(row)) {
      missingIds.add(row.messageId);
    }
  }
  return [...missingIds];
}

/** Re-fetch TDLib messages for album tiles / channel photos still missing a file URI. */
export async function hydrateTelegramMediaRows(
  chatId: number,
  rows: TelegramMessageRow[],
  lastReadOutboxMessageId: number,
  concurrency = 3,
): Promise<TelegramMessageRow[]> {
  const ids = collectMediaHydrateMessageIds(rows);
  if (ids.length === 0) return rows;

  const remapped: TelegramMessageRow[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < ids.length) {
      const index = nextIndex;
      nextIndex += 1;
      const messageId = ids[index]!;
      try {
        const raw = (await tdlibClient.send({
          '@type': 'getMessage',
          chat_id: chatId,
          message_id: messageId,
        })) as Record<string, unknown>;
        throwIfTdError(raw);
        const row = await mapTdMessage(raw, lastReadOutboxMessageId, {
          loadSenderAvatar: false,
          mediaLocalOnly: false,
        });
        if (row) remapped.push(row);
      } catch {
        /* skip missing / deleted */
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, ids.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (remapped.length === 0) return rows;
  return mergeTelegramFeedRows(rows, remapped);
}

/** @deprecated Use {@link hydrateTelegramMediaRows}. */
export const hydrateTelegramAlbumRows = hydrateTelegramMediaRows;

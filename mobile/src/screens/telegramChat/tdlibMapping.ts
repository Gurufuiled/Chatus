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
import { classifyTelegramForwardOriginType } from './telegramForwardOrigin';
import { planGridPhoto, planPhotoDisplay, type PhotoSizeCandidate } from './tdlibPhotoSize';
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
  /**
   * Базовый приоритет загрузок TDLib, которые ставит сам маппинг (фото, голосовые, документы). Экран затем
   * повышает приоритет свежих сообщений (`planMediaDownloads`), а фоновая подгрузка соседних чатов ставит
   * самый низкий, чтобы не отнимать канал у открытого чата.
   */
  downloadPriority?: number;
  /**
   * Профиль чата: у фото в строке отдельно миниатюра для плитки (`thumbnailUri`/`thumbnailFileId`, ~320 px) и
   * полный размер (`mediaUri`/`mediaFullFileId`). Ничего не качается при маппинге — очередь строит экран.
   */
  photoGridThumbnail?: boolean;
};

/** Приоритет по умолчанию для загрузок, поставленных при маппинге (нижняя ступень «свежести»). */
export const DEFAULT_MAP_DOWNLOAD_PRIORITY = 8;

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
  if (local?.is_downloading_completed !== true) return null;
  const path = typeof local?.path === 'string' ? local.path.trim() : '';
  return path ? `file://${path}` : null;
}

function getTdFileId(file: Record<string, unknown> | null): number | null {
  const id = file?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

/** Размер файла в байтах: точный `size` или оценка `expected_size` (TDLib отдаёт 0, если неизвестен). */
function getTdFileSize(file: Record<string, unknown> | null): number | undefined {
  const size = getNumber(file?.size);
  if (size != null && size > 0) return size;
  const expected = getNumber(file?.expected_size);
  return expected != null && expected > 0 ? expected : undefined;
}

async function resolveTdFileUri(
  file: Record<string, unknown> | null,
  mediaLocalOnly = false,
  downloadPriority = DEFAULT_MAP_DOWNLOAD_PRIORITY,
): Promise<string | null> {
  const localUri = getTdFileLocalUri(file);
  if (localUri) return localUri;
  if (mediaLocalOnly) return null;

  const fileId = getTdFileId(file);
  if (fileId != null) {
    scheduleTdlibFileDownload(fileId, downloadPriority);
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

const scheduledTdlibFileDownloads = new Map<number, number>();

export function scheduleTdlibFileDownload(fileId: number, priority = 16): void {
  const scheduledPriority = scheduledTdlibFileDownloads.get(fileId) ?? 0;
  if (scheduledPriority >= priority) return;
  scheduledTdlibFileDownloads.set(fileId, priority);
  void tdlibClient
    .send({
      '@type': 'downloadFile',
      file_id: fileId,
      priority,
      offset: 0,
      limit: 0,
      synchronous: false,
    })
    .catch(() => undefined)
    .finally(() => {
      setTimeout(() => {
        if (scheduledTdlibFileDownloads.get(fileId) === priority) {
          scheduledTdlibFileDownloads.delete(fileId);
        }
      }, 15_000);
    });
}

/**
 * Отмена загрузки по нажатию на плашку. Запись о постановке в очередь снимаем, иначе повторное нажатие в
 * течение 15 с было бы отброшено как «уже поставлено».
 */
export function cancelTdlibFileDownload(fileId: number): void {
  scheduledTdlibFileDownloads.delete(fileId);
  void tdlibClient
    .send({ '@type': 'cancelDownloadFile', file_id: fileId, only_if_pending: false })
    .catch(() => undefined);
}

/** Voice notes are small — try a blocking download so incoming bubbles render without waiting for `updateFile`. */
async function resolveTdVoiceFileUri(
  file: Record<string, unknown> | null,
  mediaLocalOnly: boolean,
  downloadPriority = DEFAULT_MAP_DOWNLOAD_PRIORITY,
): Promise<string | null> {
  const localUri = getTdFileLocalUri(file);
  if (localUri) return localUri;
  if (mediaLocalOnly) return null;

  const fileId = getTdFileId(file);
  if (fileId != null) {
    // Non-blocking to avoid UI stalls/hangs when opening chats with many voice notes.
    // Приоритет не максимальный: иначе все старые голосовые обгоняли видимые фото. Свежие экран поднимет сам.
    scheduleTdlibFileDownload(fileId, downloadPriority);
  }
  return null;
}

function parseTdVoiceWaveform(voiceNote: Record<string, unknown> | null): number[] {
  if (!voiceNote) return [];
  const raw = voiceNote.waveform;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const binary = atob(raw);
      const bars: number[] = [];
      for (let i = 0; i < binary.length; i += 1) {
        bars.push(binary.charCodeAt(i) / 31);
      }
      return bars;
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((value) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 31)) : 0,
    );
  }
  return [];
}

/**
 * Фото для ленты: показываем лучший из скачанных размеров, а докачиваем не самый большой оригинал, а размер для
 * ленты (~1280 px, как в Telegram) — см. `planPhotoDisplay`. Пока ничего нет — мини-превью.
 */
async function resolvePhotoUri(
  photo: Record<string, unknown> | null,
  mediaLocalOnly: boolean,
  downloadPriority = DEFAULT_MAP_DOWNLOAD_PRIORITY,
): Promise<ResolvedPhoto> {
  const candidates: PhotoSizeCandidate[] = listPhotoSizes(photo).map(({ size, file }) => ({
    width: getNumber(size.width) ?? 0,
    height: getNumber(size.height) ?? 0,
    fileId: getTdFileId(file),
    localUri: getTdFileLocalUri(file),
  }));
  const plan = planPhotoDisplay(candidates, mediaLocalOnly);

  if (plan.shouldScheduleDownload && plan.pendingFileId != null) {
    scheduleTdlibFileDownload(plan.pendingFileId, downloadPriority);
  }

  const fullFileId = plan.pendingFileId ?? undefined;
  if (plan.show) {
    return { uri: plan.show.uri, width: plan.show.width, height: plan.show.height, fullFileId };
  }

  return {
    uri: minithumbnailDataUri(photo),
    width: plan.display?.width || undefined,
    height: plan.display?.height || undefined,
    fullFileId,
  };
}

export type ResolvedGridPhoto = {
  /** Что открывать на весь экран: лучший скачанный размер, пока ничего нет — мини-превью. */
  mediaUri: string | null;
  /** Файл «полного» размера (для просмотра): НЕ ставится в очередь, его качает экран по нажатию. */
  mediaFullFileId?: number;
  /** Миниатюра плитки сетки. */
  thumbnailUri: string | null;
  thumbnailFileId?: number;
  width?: number;
  height?: number;
};

/**
 * Фото для сетки медиа профиля: плитка берёт миниатюру ~320 px, а полный размер ленты докачивается только при
 * открытии. Ничего не ставит в очередь — id файлов отдаёт строке, очередь строит `planProfileMediaDownloads`.
 */
function resolveGridPhoto(photo: Record<string, unknown> | null): ResolvedGridPhoto {
  const candidates: PhotoSizeCandidate[] = listPhotoSizes(photo).map(({ size, file }) => ({
    width: getNumber(size.width) ?? 0,
    height: getNumber(size.height) ?? 0,
    fileId: getTdFileId(file),
    localUri: getTdFileLocalUri(file),
  }));
  const grid = planGridPhoto(candidates);
  const full = planPhotoDisplay(candidates, true);
  return {
    mediaUri: full.show?.uri ?? minithumbnailDataUri(photo),
    mediaFullFileId: full.pendingFileId ?? undefined,
    thumbnailUri: grid.show?.uri ?? null,
    thumbnailFileId: grid.pendingFileId ?? undefined,
    width: full.display?.width || undefined,
    height: full.display?.height || undefined,
  };
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

async function resolveIncomingUserSender(
  raw: Record<string, unknown>,
  loadAvatar: boolean,
): Promise<{
  userId: number;
  name: string;
  avatarUri: string | null | undefined;
  avatarFileId?: number;
} | null> {
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
    let avatarFileId: number | undefined;
    if (loadAvatar) {
      const photo = getNestedRecord(user.profile_photo);
      const small = getNestedRecord(photo?.small);
      const big = getNestedRecord(photo?.big);
      const file = small ?? big;
      const localUri = getTdFileLocalUri(file);
      if (localUri) {
        avatarUri = localUri;
        setCachedUserAvatarUri(userId, localUri);
      } else {
        const fileId = typeof file?.id === 'number' ? file.id : null;
        if (fileId != null) {
          scheduleTdlibFileDownload(fileId);
          avatarFileId = fileId;
        }
        avatarUri = null;
        setCachedUserAvatarUri(userId, null);
      }
    }

    return {
      userId,
      name,
      avatarUri: loadAvatar ? avatarUri ?? null : undefined,
      avatarFileId,
    };
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

function getChatAvatarSmallFile(chat: Record<string, unknown>): Record<string, unknown> | null {
  const photo = getNestedRecord(chat.photo);
  return getNestedRecord(photo?.small);
}

type ResolvedForwardOrigin = {
  senderName: string;
  avatarUri: string | null;
  avatarFileId?: number;
};

async function resolveForwardOrigin(
  forwardInfoRaw: Record<string, unknown> | null | undefined,
): Promise<ResolvedForwardOrigin | null> {
  if (!forwardInfoRaw) return null;
  const origin = getNestedRecord(forwardInfoRaw.origin);
  if (!origin) return null;

  const originKind = classifyTelegramForwardOriginType(origin['@type']);
  try {
    if (originKind === 'user') {
      const userId = typeof origin.sender_user_id === 'number' ? origin.sender_user_id : null;
      if (userId == null) return null;
      const cachedName = getCachedUserName(userId);
      const cachedAvatar = getCachedUserAvatarUri(userId);
      if (cachedName && cachedAvatar !== undefined) {
        return { senderName: cachedName, avatarUri: cachedAvatar };
      }
      const user = (await tdlibClient.send({
        '@type': 'getUser',
        user_id: userId,
      })) as Record<string, unknown>;
      throwIfTdError(user);
      const firstName = typeof user.first_name === 'string' ? user.first_name.trim() : '';
      const lastName = typeof user.last_name === 'string' ? user.last_name.trim() : '';
      const name = [firstName, lastName].filter(Boolean).join(' ') || `User ${userId}`;
      setCachedUserName(userId, name);
      
      const photo = getNestedRecord(user.profile_photo);
      const small = getNestedRecord(photo?.small);
      const fileId = typeof small?.id === 'number' ? small.id : null;
      const localUri = getTdFileLocalUri(small);
      if (localUri) {
        setCachedUserAvatarUri(userId, localUri);
        return { senderName: name, avatarUri: localUri };
      }
      if (fileId != null) {
        scheduleTdlibFileDownload(fileId);
        return { senderName: name, avatarUri: null, avatarFileId: fileId };
      }
      return { senderName: name, avatarUri: null };
    }
    
    if (originKind === 'chat' || originKind === 'channel') {
      const chatId = typeof origin.sender_chat_id === 'number' 
        ? origin.sender_chat_id 
        : typeof origin.chat_id === 'number' 
          ? origin.chat_id 
          : null;
      if (chatId == null) return null;

      const chat = (await tdlibClient.send({
        '@type': 'getChat',
        chat_id: chatId,
      })) as Record<string, unknown>;
      throwIfTdError(chat);
      const name = typeof chat.title === 'string' ? chat.title.trim() : `Chat ${chatId}`;
      const avatarSmallFile = getChatAvatarSmallFile(chat);
      const localUri = getTdFileLocalUri(avatarSmallFile);
      if (localUri) {
        return { senderName: name, avatarUri: localUri };
      }
      const fileId = typeof avatarSmallFile?.id === 'number' ? avatarSmallFile.id : null;
      if (fileId != null) {
        scheduleTdlibFileDownload(fileId);
        return { senderName: name, avatarUri: null, avatarFileId: fileId };
      }
      return { senderName: name, avatarUri: null };
    }

    if (originKind === 'import') {
      const name = typeof origin.sender_name === 'string' ? origin.sender_name.trim() : 'Imported';
      return { senderName: name, avatarUri: null };
    }

    if (originKind === 'hidden_user') {
      const name = typeof origin.sender_name === 'string' ? origin.sender_name.trim() : 'Hidden User';
      return { senderName: name, avatarUri: null };
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[tdlibMapping] resolveForwardOrigin failed:', e);
    }
  }
  return null;
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

export function getTdMessageReactions(raw: Record<string, unknown>): TelegramMessageRow['reactions'] {
  const interaction = getNestedRecord(raw.interaction_info);
  const reactionsObj = getNestedRecord(interaction?.reactions);
  const reactionsList = Array.isArray(reactionsObj?.reactions) ? reactionsObj.reactions : [];
  const mapped = reactionsList
    .map((rObj) => {
      const r = getNestedRecord(rObj);
      const typeObj = getNestedRecord(r?.type);
      const emoji = typeof typeObj?.emoji === 'string' ? typeObj.emoji : '';
      const count = typeof r?.total_count === 'number' ? r.total_count : 0;
      const reacted_by_me =
        r?.is_chosen === true || (typeof r?.chosen_order === 'number' && r.chosen_order > 0);
      return { emoji, count, reacted_by_me };
    })
    .filter((item) => item.emoji !== '');
  return mapped.length > 0 ? mapped : undefined;
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
  const downloadPriority = options?.downloadPriority ?? DEFAULT_MAP_DOWNLOAD_PRIORITY;
  const incomingSender = await resolveIncomingUserSender(raw, loadAvatar);
  const senderName = outgoing ? undefined : incomingSender?.name;
  const senderUserId = outgoing ? undefined : incomingSender?.userId;
  const senderAvatarUri =
    outgoing || !loadAvatar ? undefined : incomingSender?.avatarUri;
  const senderAvatarFileId =
    outgoing || !loadAvatar ? undefined : incomingSender?.avatarFileId;
  const viewCount = getTdViewCount(raw);
  const { discussionReplyCount, discussionChatId, messageThreadId } = getTdDiscussionFields(raw);
  const mediaAlbumId = getTdMediaAlbumId(raw);
  const forwardInfoRaw = getNestedRecord(raw.forward_info);
  const forwardInfo = forwardInfoRaw ? await resolveForwardOrigin(forwardInfoRaw) : null;
  const reactions = getTdMessageReactions(raw);
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
    senderAvatarFileId,
    viewCount,
    discussionReplyCount,
    discussionChatId,
    messageThreadId,
    mediaAlbumId,
    forwardInfo,
    reactions,
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
    const fileId = getTdFileId(voice);
    const uri = await resolveTdVoiceFileUri(voice, mediaLocalOnly, downloadPriority);
    const duration = typeof voiceNote?.duration === 'number' ? voiceNote.duration * 1000 : 0;
    return {
      ...base,
      kind: 'voice',
      text: 'Голосовое',
      voiceUri: uri,
      mediaFullFileId: uri ? undefined : (fileId ?? undefined),
      durationMs: duration,
      waveform: parseTdVoiceWaveform(voiceNote),
    };
  }

  if (kind === 'messagePhoto' && options?.photoGridThumbnail === true) {
    const photo = getNestedRecord(content.photo);
    const grid = resolveGridPhoto(photo);
    return {
      ...base,
      kind: 'image',
      text: caption || (grid.mediaUri ? '' : 'Фото'),
      mediaUri: grid.mediaUri ?? undefined,
      mediaFullFileId: grid.mediaFullFileId,
      thumbnailUri: grid.thumbnailUri ?? undefined,
      thumbnailFileId: grid.thumbnailFileId,
      width: grid.width,
      height: grid.height,
    };
  }

  if (kind === 'messagePhoto') {
    const photo = getNestedRecord(content.photo);
    const resolved = await resolvePhotoUri(photo, mediaLocalOnly, downloadPriority);
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
    const fileId = getTdFileId(file);
    const thumbnail = getNestedRecord(video?.thumbnail);
    const thumbnailFile = getNestedRecord(thumbnail?.file);
    const uri = getTdFileLocalUri(file);
    const thumbnailUri = getTdFileLocalUri(thumbnailFile);
    const thumbnailFileId = thumbnailUri ? null : getTdFileId(thumbnailFile);
    const width = getNumber(video?.width);
    const height = getNumber(video?.height);
    const durationSec = getNumber(video?.duration) ?? 0;
    const maxSide =
      width != null && height != null ? Math.max(width, height) : null;
    const isSquareShortVideo =
      width != null &&
      height != null &&
      width > 0 &&
      height > 0 &&
      Math.abs(width - height) <= 4 &&
      maxSide != null &&
      maxSide <= 640 &&
      durationSec > 0 &&
      durationSec <= 60 &&
      !caption.trim();
    if (isSquareShortVideo) {
      return {
        ...base,
        kind: 'video_note',
        text: 'Видеосообщение',
        mediaUri: uri ?? undefined,
        mediaFullFileId: uri ? undefined : (fileId ?? undefined),
        thumbnailUri: thumbnailUri ?? undefined,
        thumbnailFileId: thumbnailFileId ?? undefined,
        width,
        height,
        durationMs: durationSec * 1000,
      };
    }
    return {
      ...base,
      kind: 'video',
      text: caption,
      mediaUri: uri ?? undefined,
      mediaFullFileId: uri ? undefined : (fileId ?? undefined),
      mediaFullFileSize: uri ? undefined : getTdFileSize(file),
      thumbnailUri: thumbnailUri ?? undefined,
      thumbnailFileId: thumbnailFileId ?? undefined,
      width,
      height,
      durationMs: durationSec * 1000,
    };
  }

  if (kind === 'messageVideoNote') {
    const videoNote = getNestedRecord(content.video_note);
    const file = getNestedRecord(videoNote?.video);
    const fileId = getTdFileId(file);
    const thumbnail = getNestedRecord(videoNote?.thumbnail);
    const thumbnailFile = getNestedRecord(thumbnail?.file);
    const mini = getNestedRecord(videoNote?.minithumbnail);
    const miniData = typeof mini?.data === 'string' && mini.data.length > 8 ? mini.data : null;
    const miniUri = miniData ? `data:image/jpeg;base64,${miniData}` : null;
    const uri = getTdFileLocalUri(file);
    const thumbnailUri = getTdFileLocalUri(thumbnailFile);
    const thumbnailFileId = thumbnailUri ? null : getTdFileId(thumbnailFile);
    const side = getNumber(videoNote?.length);
    return {
      ...base,
      kind: 'video_note',
      text: 'Видеосообщение',
      mediaUri: uri ?? undefined,
      mediaFullFileId: uri ? undefined : (fileId ?? undefined),
      thumbnailUri: thumbnailUri ?? miniUri ?? undefined,
      thumbnailFileId: thumbnailFileId ?? undefined,
      width: side,
      height: side,
      durationMs: (getNumber(videoNote?.duration) ?? 0) * 1000,
    };
  }

  if (kind === 'messageDocument') {
    const document = getNestedRecord(content.document);
    const file = getNestedRecord(document?.document);
    const uri = await resolveTdFileUri(file, mediaLocalOnly, downloadPriority);
    const documentFileId = getTdFileId(file);
    return {
      ...base,
      kind: 'file',
      text: caption,
      mediaUri: uri,
      // Без id файла строка не получала `updateFile` и показывала документ скачанным только после перезагрузки чата.
      mediaFullFileId: uri ? undefined : (documentFileId ?? undefined),
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

function voiceRowNeedsHydrate(row: TelegramMessageRow): boolean {
  if (row.kind !== 'voice' || row.messageId <= 0) return false;
  const uri = row.voiceUri?.trim() ?? '';
  return !uri || row.mediaFullFileId != null;
}

function videoRowNeedsHydrate(row: TelegramMessageRow): boolean {
  if ((row.kind !== 'video' && row.kind !== 'video_note') || row.messageId <= 0) return false;
  const uri = row.mediaUri?.trim() ?? '';
  return !uri || row.mediaFullFileId != null;
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
    if (voiceRowNeedsHydrate(row)) {
      missingIds.add(row.messageId);
    }
    if (videoRowNeedsHydrate(row)) {
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

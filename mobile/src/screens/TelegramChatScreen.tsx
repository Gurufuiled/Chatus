import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatsStackParamList } from '../navigation/types';
import { ChatContextMenuOverlay } from '../components/ChatContextMenuOverlay';
import { FileBubble } from '../components/FileBubble';
import { ImageBubble } from '../components/ImageBubble';
import { InputBar, type FilePickResult, type MediaPickResult } from '../components/InputBar';
import { MessageTimeStatus } from '../components/MessageTimeStatus';
import { ReplyPreview } from '../components/ReplyPreview';
import { VideoBubble } from '../components/VideoBubble';
import { VoiceBubble } from '../components/VoiceBubble';
import { useTheme } from '../contexts/ThemeContext';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import { getCachedUserName, setCachedUserName } from '../services/tdlib/userNameCache';
import type { VoiceRecordingResult } from '../services/VoiceRecorderService';
import type { Message } from '../stores/types';
import { uiStore } from '../stores/uiStore';
import type { ThemeColors } from '../theme/palettes';
import { DEFAULT_CHAT_THEME_ID } from '../theme/chatThemes';
import { withAlpha } from '../theme/stylePrimitives';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../presentation';
import {
  ChatBackgroundPattern,
  estimateMenuCardHeight,
  getCopyableContent,
  MENU_EDGE_GAP,
  MENU_HEIGHT,
  MENU_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from './chatScreen.shared';
import {
  CHAT_BUBBLE_MAX_WIDTH_PCT,
  CHAT_MSG_GROUP_TIME_GAP_MS,
  CHAT_MSG_HORIZONTAL_PADDING,
  CHAT_MSG_ROW_MARGIN_GROUPED,
  CHAT_MSG_ROW_MARGIN_ISOLATED,
  CHAT_MSG_VERTICAL_PADDING,
} from '../presentation/telegramChatUi';

type TelegramMessageKind = 'text' | 'voice' | 'image' | 'video' | 'file' | 'service';
type TelegramMessageStatus = 'sending' | 'sent' | 'read' | 'failed';

type TelegramMessageRow = {
  id: string;
  messageId: number;
  kind: TelegramMessageKind;
  text: string;
  outgoing: boolean;
  dateMs: number;
  status: TelegramMessageStatus;
  replyToMessageId?: number | null;
  voiceUri?: string | null;
  mediaUri?: string | null;
  thumbnailUri?: string | null;
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: number;
  /** Display name of the sender – populated for incoming messages in group/supergroup chats. */
  senderName?: string | null;
  /** Post view count from TDLib `interaction_info.view_count` (channel posts). */
  viewCount?: number;
};

/** Same layout contract as `ChatScreen` context menu — drives `ChatContextMenuOverlay`. */
type TelegramMessageMenuState = {
  messageId: string;
  isMe: boolean;
  previewTop: number;
  previewLeft: number;
  previewWidth: number;
  previewHeight: number;
  menuTop: number;
  menuLeft: number;
  placement: 'above' | 'below';
} | null;

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function fileUriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}

function getLocalInputFile(uri: string): Record<string, unknown> {
  return {
    '@type': 'inputFileLocal',
    path: fileUriToPath(uri),
  };
}

function formattedText(text?: string): Record<string, unknown> {
  return {
    '@type': 'formattedText',
    text: text?.trim() ?? '',
    entities: [],
  };
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function previewForUnsupported(kind: string | undefined): string {
  switch (kind) {
    case 'messagePhoto':
      return 'Фото';
    case 'messageVideo':
      return 'Видео';
    case 'messageDocument':
      return 'Файл';
    case 'messageSticker':
      return 'Стикер';
    default:
      return 'Сообщение';
  }
}

function getMessageId(raw: Record<string, unknown>): number | null {
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  return Number.isFinite(id) ? id : null;
}

function getTdMessageStatus(
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

function getLastReadOutboxMessageId(value: Record<string, unknown>): number {
  const raw = value.last_read_outbox_message_id;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function getReplyToMessageId(raw: Record<string, unknown>): number | null {
  const replyTo = getNestedRecord(raw.reply_to);
  if (replyTo?.['@type'] !== 'messageReplyToMessage') return null;

  const messageId = replyTo.message_id;
  return typeof messageId === 'number' && Number.isFinite(messageId) && messageId > 0 ? messageId : null;
}

function getInputReplyTo(messageId: number | null): Record<string, unknown> | undefined {
  if (messageId == null || messageId <= 0) return undefined;
  return {
    '@type': 'inputMessageReplyToMessage',
    message_id: messageId,
    quote: null,
    checklist_task_id: 0,
  };
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

async function mapTdMessages(
  rawMessages: Record<string, unknown>[],
  lastReadOutboxMessageId: number,
  concurrency = 4,
): Promise<TelegramMessageRow[]> {
  const mapped: Array<TelegramMessageRow | null> = new Array(rawMessages.length).fill(null);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < rawMessages.length) {
      const index = nextIndex;
      nextIndex += 1;
      const row = await mapTdMessage(rawMessages[index], lastReadOutboxMessageId);
      mapped[index] = row;
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, rawMessages.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return mapped.filter((item): item is TelegramMessageRow => item != null);
}

async function downloadTdlibFile(fileId: number): Promise<string | null> {
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

// ─── Sender name resolution (for group messages) ─────────────────────────────

async function resolveUserName(userId: number): Promise<string> {
  const cached = getCachedUserName(userId);
  if (cached) return cached;
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
    return name;
  } catch {
    return `User ${userId}`;
  }
}

/**
 * Resolves the display name for `message.sender_id`.
 * Returns null for outgoing messages or unsupported sender types.
 */
async function getTdSenderName(raw: Record<string, unknown>): Promise<string | null> {
  if (raw.is_outgoing === true) return null;
  const sender = getNestedRecord(raw.sender_id);
  if (!sender) return null;
  if (sender['@type'] === 'messageSenderUser') {
    const userId = typeof sender.user_id === 'number' ? sender.user_id : null;
    if (userId == null) return null;
    return resolveUserName(userId);
  }
  return null; // messageSenderChat – skip for now
}

/** Extracts post view count from `message.interaction_info`. */
function getTdViewCount(raw: Record<string, unknown>): number | undefined {
  const info = getNestedRecord(raw.interaction_info);
  const count = info?.view_count;
  return typeof count === 'number' && count > 0 ? count : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────

async function loadLastReadOutboxMessageId(chatId: number): Promise<number> {
  const chat = (await tdlibClient.send({
    '@type': 'getChat',
    chat_id: chatId,
  })) as Record<string, unknown>;
  throwIfTdError(chat);
  return getLastReadOutboxMessageId(chat);
}

async function mapTdMessage(
  raw: Record<string, unknown>,
  lastReadOutboxMessageId: number,
): Promise<TelegramMessageRow | null> {
  const id = getMessageId(raw);
  if (id == null) return null;
  const content = getNestedRecord(raw.content);
  const kind = content?.['@type'] as string | undefined;
  const outgoing = raw.is_outgoing === true;
  const dateSec = typeof raw.date === 'number' ? raw.date : Math.floor(Date.now() / 1000);
  const caption = getFormattedText(content?.caption);
  const senderName = outgoing ? null : await getTdSenderName(raw);
  const viewCount = getTdViewCount(raw);
  const base = {
    id: String(id),
    messageId: id,
    outgoing,
    dateMs: dateSec * 1000,
    status: getTdMessageStatus(raw, lastReadOutboxMessageId),
    replyToMessageId: getReplyToMessageId(raw),
    senderName: senderName ?? undefined,
    viewCount,
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
    const uri = localPath ? `file://${localPath}` : fileId != null ? await downloadTdlibFile(fileId).catch(() => null) : null;
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
    const [uri, thumbnailUri] = await Promise.all([
      resolveTdFileUri(file),
      resolveTdFileUri(thumbnailFile),
    ]);
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

function optimisticOutgoingMessage(
  text: string,
  tempId = -Date.now(),
  replyToMessageId?: number | null,
): TelegramMessageRow {
  return {
    id: `temp-${Math.abs(tempId)}`,
    messageId: tempId,
    kind: 'service',
    text,
    outgoing: true,
    dateMs: Date.now(),
    status: 'sending',
    replyToMessageId,
  };
}

function getTelegramReplyPreviewText(row: TelegramMessageRow): string {
  if (row.kind === 'text') return row.text.trim() || 'Пустое сообщение';
  if (row.kind === 'image') return row.text.trim() ? `Фото: ${row.text.trim()}` : 'Фото';
  if (row.kind === 'video') return row.text.trim() ? `Видео: ${row.text.trim()}` : 'Видео';
  if (row.kind === 'voice') return 'Голосовое сообщение';
  if (row.kind === 'file') return row.fileName?.trim() || 'Файл';
  return row.text.trim() || 'Сообщение';
}

function getTelegramReplyThumbnailUri(row: TelegramMessageRow | null | undefined): string | null {
  if (!row) return null;
  if (row.kind === 'image') return row.mediaUri?.trim() || null;
  if (row.kind === 'video') return row.thumbnailUri?.trim() || null;
  return null;
}

function telegramRowToInputReplyMessage(row: TelegramMessageRow, chatId: number): Message {
  let media: Message['media'] | undefined;
  if (row.kind === 'image' || row.kind === 'video' || row.kind === 'file') {
    media = [
      {
        media_type: row.kind,
        remote_url: row.mediaUri ?? undefined,
        thumbnail_url: row.thumbnailUri ?? undefined,
        width: row.width,
        height: row.height,
        duration_ms: row.durationMs,
        file_name: row.fileName,
        file_size: row.fileSize,
      },
    ];
  } else if (row.kind === 'voice') {
    media = [
      {
        media_type: 'voice',
        remote_url: row.voiceUri ?? undefined,
        duration_ms: row.durationMs,
        waveform: row.waveform,
      },
    ];
  }

  return {
    id: String(row.messageId),
    chat_id: String(chatId),
    sender_id: row.outgoing ? 'telegram:self' : 'telegram:peer',
    msg_type: row.kind === 'image' || row.kind === 'video' || row.kind === 'file' || row.kind === 'voice'
      ? row.kind
      : 'text',
    content: row.kind === 'text' ? row.text : row.text || null,
    reply_to_id: row.replyToMessageId != null ? String(row.replyToMessageId) : null,
    is_edited: 0,
    is_deleted: 0,
    status: row.status,
    transport: 'telegram',
    server_id: null,
    created_at: row.dateMs,
    updated_at: row.dateMs,
    media,
  };
}

/**
 * Returns true when two adjacent messages belong to the same visual group chain.
 * Groups by send direction (outgoing vs incoming) — not by actual sender identity —
 * which is correct for 1-to-1 chats; group chats with multiple senders need a
 * sender-id comparison on top of this.
 */
function isSameGroup(
  a: TelegramMessageRow | undefined,
  b: TelegramMessageRow,
): boolean {
  return (
    a != null &&
    a.outgoing === b.outgoing &&
    Math.abs(a.dateMs - b.dateMs) <= CHAT_MSG_GROUP_TIME_GAP_MS
  );
}

function upsertMessage(
  rows: TelegramMessageRow[],
  next: TelegramMessageRow,
  oldMessageId?: number | null,
): TelegramMessageRow[] {
  const withoutSame = rows.filter(
    (item) =>
      item.id !== next.id &&
      item.messageId !== next.messageId &&
      (oldMessageId == null || item.messageId !== oldMessageId),
  );
  return [next, ...withoutSame].sort((a, b) => b.messageId - a.messageId);
}

function applyReadOutboxStatus(
  rows: TelegramMessageRow[],
  lastReadOutboxMessageId: number,
): TelegramMessageRow[] {
  return rows.map((item) => {
    if (
      !item.outgoing ||
      item.messageId <= 0 ||
      item.messageId > lastReadOutboxMessageId ||
      item.status === 'sending' ||
      item.status === 'failed' ||
      item.status === 'read'
    ) {
      return item;
    }
    return { ...item, status: 'read' };
  });
}

function markMessageFailed(rows: TelegramMessageRow[], messageId: number): TelegramMessageRow[] {
  return rows.map((item) => (item.messageId === messageId ? { ...item, status: 'failed' } : item));
}

export function TelegramChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList, 'TelegramChat'>>();
  const headerHeightNav = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createTelegramChatStyles(colors), [colors]);
  const headerChromeStyles = useMemo(
    () => createTelegramStackHeaderPresentationStyles(colors),
    [colors],
  );
  const route = useRoute<RouteProp<ChatsStackParamList, 'TelegramChat'>>();
  const { telegramChatId, title, avatarUri, chatType: routeChatType } = route.params;
  const telegramWallpaperKey = `telegram:${telegramChatId}`;
  const storedWallpaperThemeId = uiStore((s) => s.chatThemeIdByChatId[telegramWallpaperKey]);
  const wallpaperThemeId = storedWallpaperThemeId ?? DEFAULT_CHAT_THEME_ID;
  const chatId = useMemo(() => Number.parseInt(telegramChatId, 10), [telegramChatId]);
  const isChannel = routeChatType === 'channel';
  const isGroupChat = routeChatType === 'group' || routeChatType === 'supergroup';
  const [messages, setMessages] = useState<TelegramMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [replyToMessageId, setReplyToMessageId] = useState<number | null>(null);
  /** Whether the current user can post in this chat (false for read-only broadcast channels). */
  const [canPost, setCanPost] = useState(true);
  /** Member or subscriber count for the chat header subtitle. */
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const oldestMessageIdRef = useRef<number>(0);
  const lastReadOutboxMessageIdRef = useRef<number>(0);
  const mountedRef = useRef(true);
  /** Ref kept in sync with `messages` so renderItem can read adjacent rows without a dep on `messages`. */
  const messagesRef = useRef<TelegramMessageRow[]>([]);
  const [menuState, setMenuState] = useState<TelegramMessageMenuState>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});
  /** Bottom composer chrome height — drives context-menu placement above the input bar. */
  const [inputBarHeight, setInputBarHeight] = useState(88);

  const headerTitle = useMemo(() => title || `Telegram ${telegramChatId}`, [telegramChatId, title]);
  const headerSubtitle = useMemo(() => {
    if (memberCount != null && memberCount > 0) {
      return isChannel
        ? `${memberCount.toLocaleString()} подписчиков`
        : `${memberCount.toLocaleString()} участников`;
    }
    return null;
  }, [isChannel, memberCount]);
  const messageById = useMemo(() => {
    const map = new Map<number, TelegramMessageRow>();
    for (const message of messages) {
      map.set(message.messageId, message);
    }
    return map;
  }, [messages]);
  const replyToRow = replyToMessageId != null ? messageById.get(replyToMessageId) ?? null : null;
  const replyToInputMessage = useMemo(
    () => (replyToRow ? telegramRowToInputReplyMessage(replyToRow, chatId) : null),
    [chatId, replyToRow],
  );
  const replyAuthorName = replyToRow ? (replyToRow.outgoing ? 'Вы' : headerTitle) : null;

  const activeMenuMessage = useMemo(() => {
    if (!menuState) return null;
    const row = messages.find((m) => m.id === menuState.messageId);
    return row ? telegramRowToInputReplyMessage(row, chatId) : null;
  }, [chatId, menuState, messages]);

  const telegramMenuActions = useMemo(
    () => [
      {
        key: 'reply',
        label: 'Ответить',
        icon: 'corner-left-up' as React.ComponentProps<typeof Feather>['name'],
        color: colors.textPrimary,
        disabled: false,
      },
      {
        key: 'copy',
        label: 'Скопировать',
        icon: 'copy' as React.ComponentProps<typeof Feather>['name'],
        color: colors.textPrimary,
        disabled: false,
      },
      {
        key: 'pin',
        label: 'Закрепить',
        icon: 'bookmark' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
      {
        key: 'forward',
        label: 'Переслать',
        icon: 'corner-up-right' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
      {
        key: 'delete',
        label: 'Удалить',
        icon: 'trash-2' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
      {
        key: 'select',
        label: 'Выбрать',
        icon: 'check-circle' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
    ],
    [colors.iconMuted, colors.textPrimary],
  );

  useLayoutEffect(() => {
    const initialChar = (headerTitle.trim()[0] || '?').toUpperCase();
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={headerTitle}
          accessibilityHint="Открывает профиль"
          onPress={() => Alert.alert('Профиль')}
          style={({ pressed }) => [
            headerChromeStyles.pressableRow,
            pressed ? headerChromeStyles.pressablePressed : null,
          ]}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={headerChromeStyles.avatar} />
          ) : (
            <View style={headerChromeStyles.avatarPlaceholder}>
              <Text style={headerChromeStyles.avatarPlaceholderLetter}>{initialChar}</Text>
            </View>
          )}
          <View style={headerChromeStyles.titleWrap}>
            <Text style={headerChromeStyles.headerTitleText} numberOfLines={1} ellipsizeMode="tail">
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text style={headerChromeStyles.headerSubtitleText} numberOfLines={1} ellipsizeMode="tail">
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ),
    });
  }, [avatarUri, headerChromeStyles, headerSubtitle, headerTitle, navigation]);

  // Keep ref in sync during render so renderItem always reads the current array
  // (an effect would lag by one frame, causing stale neighbor lookups).
  messagesRef.current = messages;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureReady = useCallback(async () => {
    await applyTdlibParameters();
    const { ready, state } = await waitForTdlibAuthorizationReady();
    if (!ready) {
      throw new Error(`Сессия Telegram не готова (${state ?? 'таймаут'})`);
    }
  }, []);

  // Load posting permissions and member count once on mount (after ensureReady is defined)
  useEffect(() => {
    if (!Number.isFinite(chatId)) return;
    let cancelled = false;

    async function loadChatMeta() {
      try {
        await ensureReady();
        const chat = (await tdlibClient.send({
          '@type': 'getChat',
          chat_id: chatId,
        })) as Record<string, unknown>;
        throwIfTdError(chat);
        // Determine if this is a broadcast channel so we can apply posting restriction.
        // We check the chat type directly rather than `can_send_basic_messages` alone,
        // because that field reflects member-level defaults and would incorrectly block
        // admins. Full admin detection via getChatMember is a future improvement.
        const type = getNestedRecord(chat.type);
        const isBroadcastChannel =
          type?.['@type'] === 'chatTypeSupergroup' && type?.is_channel === true;
        const perms = getNestedRecord(chat.permissions);
        if (!cancelled) {
          // Read-only only for broadcast channels where members cannot send messages.
          setCanPost(!isBroadcastChannel || perms?.can_send_basic_messages !== false);
        }
        // Member/subscriber count via getSupergroup / getBasicGroup (reuse `type` from above)
        const typeKind = type?.['@type'];
        if (typeKind === 'chatTypeSupergroup') {
          const sgId = typeof type?.supergroup_id === 'number' ? type.supergroup_id : null;
          if (sgId != null) {
            const sg = (await tdlibClient.send({
              '@type': 'getSupergroup',
              supergroup_id: sgId,
            })) as Record<string, unknown>;
            throwIfTdError(sg);
            if (!cancelled && typeof sg.member_count === 'number') {
              setMemberCount(sg.member_count);
            }
          }
        } else if (typeKind === 'chatTypeBasicGroup') {
          const bgId = typeof type?.basic_group_id === 'number' ? type.basic_group_id : null;
          if (bgId != null) {
            const bg = (await tdlibClient.send({
              '@type': 'getBasicGroup',
              basic_group_id: bgId,
            })) as Record<string, unknown>;
            throwIfTdError(bg);
            if (!cancelled && typeof bg.member_count === 'number') {
              setMemberCount(bg.member_count);
            }
          }
        }
      } catch {
        /* best-effort: permissions default to canPost=true */
      }
    }

    void loadChatMeta();
    return () => {
      cancelled = true;
    };
  }, [chatId, ensureReady]);

  const loadHistory = useCallback(
    async (older = false) => {
      if (!Number.isFinite(chatId)) return;
      if (older) {
        if (loadingOlder || oldestMessageIdRef.current === 0) return;
        setLoadingOlder(true);
      } else {
        setLoading(true);
      }
      try {
        await ensureReady();
        const lastReadOutboxMessageId = await loadLastReadOutboxMessageId(chatId);
        lastReadOutboxMessageIdRef.current = Math.max(
          lastReadOutboxMessageIdRef.current,
          lastReadOutboxMessageId,
        );
        const response = (await tdlibClient.send({
          '@type': 'getChatHistory',
          chat_id: chatId,
          from_message_id: older ? oldestMessageIdRef.current : 0,
          offset: 0,
          limit: 40,
          only_local: false,
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const rawMessages = Array.isArray(response.messages) ? response.messages : [];
        const mapped = await mapTdMessages(
          rawMessages.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object'),
          lastReadOutboxMessageIdRef.current,
        );

        if (!mountedRef.current) return;
        setMessages((prev) => {
          const merged = older ? [...prev] : [];
          for (const item of mapped) {
            const idx = merged.findIndex((existing) => existing.id === item.id);
            if (idx >= 0) merged[idx] = item;
            else merged.push(item);
          }
          const sorted = merged.sort((a, b) => b.messageId - a.messageId);
          oldestMessageIdRef.current = sorted.length > 0 ? sorted[sorted.length - 1].messageId : 0;
          return sorted;
        });
        setLastError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!mountedRef.current) return;
        setLastError(message);
        if (!older) Alert.alert('Telegram', message);
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [chatId, ensureReady, loadingOlder],
  );

  useFocusEffect(
    useCallback(() => {
      void loadHistory(false);
      const unsubscribe = tdlibClient.subscribe((json) => {
        try {
          const update = JSON.parse(json) as Record<string, unknown>;
          const type = update['@type'];
          if (type === 'updateChatReadOutbox') {
            if (update.chat_id !== chatId) return;
            const lastReadOutboxMessageId = getLastReadOutboxMessageId(update);
            if (lastReadOutboxMessageId <= lastReadOutboxMessageIdRef.current) return;
            lastReadOutboxMessageIdRef.current = lastReadOutboxMessageId;
            setMessages((prev) => applyReadOutboxStatus(prev, lastReadOutboxMessageId));
            return;
          }

          if (
            type !== 'updateNewMessage' &&
            type !== 'updateMessageSendSucceeded' &&
            type !== 'updateMessageSendFailed'
          ) {
            return;
          }

          const rawMessage = getNestedRecord(update.message);
          const oldMessageId =
            typeof update.old_message_id === 'number' && Number.isFinite(update.old_message_id)
              ? update.old_message_id
              : null;
          if (!rawMessage || rawMessage.chat_id !== chatId) {
            if (type === 'updateMessageSendFailed' && oldMessageId != null) {
              setMessages((prev) => markMessageFailed(prev, oldMessageId));
            }
            return;
          }
          void mapTdMessage(rawMessage, lastReadOutboxMessageIdRef.current).then((row) => {
            if (!row || !mountedRef.current) return;
            setMessages((prev) => upsertMessage(prev, row, oldMessageId));
          });
        } catch {
          /* ignore malformed TDLib updates */
        }
      });
      return unsubscribe;
    }, [chatId, loadHistory]),
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !Number.isFinite(chatId)) return;
      const tempId = -Date.now();
      const activeReplyToMessageId = replyToMessageId;
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'text',
        text: trimmed,
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        replyToMessageId: activeReplyToMessageId,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: {
            '@type': 'inputMessageText',
            text: {
              '@type': 'formattedText',
              text: trimmed,
              entities: [],
            },
          },
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (mapped) {
          setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), mapped));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert('Не удалось отправить', message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendVoice = useCallback(
    async (result: VoiceRecordingResult) => {
      if (!Number.isFinite(chatId)) return;
      const tempId = -Date.now();
      const activeReplyToMessageId = replyToMessageId;
      const localPath = fileUriToPath(result.uri);
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'voice',
        text: 'Голосовое',
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        replyToMessageId: activeReplyToMessageId,
        voiceUri: result.uri,
        durationMs: result.durationMs,
        waveform: result.waveform,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: {
            '@type': 'inputMessageVoiceNote',
            voice_note: {
              '@type': 'inputFileLocal',
              path: localPath,
            },
            duration: Math.max(1, Math.round(result.durationMs / 1000)),
          },
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (mapped) {
          setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), {
            ...mapped,
            voiceUri: mapped.voiceUri ?? result.uri,
            waveform: mapped.waveform && mapped.waveform.length > 0 ? mapped.waveform : result.waveform,
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert('Не удалось отправить голосовое', message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendInputMessageContent = useCallback(
    async (
      inputMessageContent: Record<string, unknown>,
      optimisticText: string,
      failureTitle: string,
    ) => {
      if (!Number.isFinite(chatId)) return;
      const activeReplyToMessageId = replyToMessageId;
      const optimistic = optimisticOutgoingMessage(optimisticText, -Date.now(), activeReplyToMessageId);
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: inputMessageContent,
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (mapped) {
          setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), mapped));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert(failureTitle, message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendMedia = useCallback(
    async (result: MediaPickResult) => {
      if (result.kind === 'video') {
        await sendInputMessageContent(
          {
            '@type': 'inputMessageVideo',
            video: getLocalInputFile(result.uri),
            duration: Math.max(1, Math.round((result.durationMs ?? 1000) / 1000)),
            width: Math.max(1, Math.round(result.width ?? 1)),
            height: Math.max(1, Math.round(result.height ?? 1)),
            supports_streaming: true,
            caption: formattedText(result.caption),
          },
          result.caption?.trim() ? `Видео: ${result.caption.trim()}` : 'Видео',
          'Не удалось отправить видео',
        );
        return;
      }

      await sendInputMessageContent(
        {
          '@type': 'inputMessagePhoto',
          photo: getLocalInputFile(result.uri),
          width: Math.max(1, Math.round(result.width ?? 1)),
          height: Math.max(1, Math.round(result.height ?? 1)),
          caption: formattedText(result.caption),
        },
        result.caption?.trim() ? `Фото: ${result.caption.trim()}` : 'Фото',
        'Не удалось отправить фото',
      );
    },
    [sendInputMessageContent],
  );

  const sendFile = useCallback(
    async (result: FilePickResult) => {
      await sendInputMessageContent(
        {
          '@type': 'inputMessageDocument',
          document: getLocalInputFile(result.uri),
          disable_content_type_detection: false,
          caption: formattedText(),
        },
        result.name.trim() || 'Файл',
        'Не удалось отправить файл',
      );
    },
    [sendInputMessageContent],
  );

  const setMessageContentRef = useCallback((messageId: string, node: View | null) => {
    if (node) {
      messageContentRefs.current[messageId] = node;
    } else {
      delete messageContentRefs.current[messageId];
    }
  }, []);

  const closeMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMenuState(null);
      }
    });
  }, [menuAnim]);

  useEffect(() => {
    if (!menuState) {
      menuAnim.setValue(0);
      return;
    }
    Animated.spring(menuAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [menuAnim, menuState]);

  const openTelegramMessageMenu = useCallback(
    (row: TelegramMessageRow) => {
      if (row.messageId <= 0) return;
      const target = messageContentRefs.current[row.id];
      if (!target) return;
      Keyboard.dismiss();
      target.measureInWindow((pageX, pageY, width, height) => {
        const menuGap = 4;
        const menuCardHeight = Math.max(MENU_HEIGHT, estimateMenuCardHeight(2)) + 10;
        const bottomSafety = 28;
        const composerOffset = inputBarHeight + Math.max(insets.bottom, 12);
        const effectiveBottom = SCREEN_HEIGHT - (composerOffset + bottomSafety);
        const previewWidth = Math.min(Math.ceil(width) + 1, SCREEN_WIDTH - MENU_EDGE_GAP * 2);
        const previewLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(pageX, SCREEN_WIDTH - previewWidth - MENU_EDGE_GAP),
        );
        const minPreviewTop = Math.max(insets.top + 12, MENU_EDGE_GAP);
        const spaceForPreview = effectiveBottom - minPreviewTop - menuGap - menuCardHeight;
        const previewDisplayHeight = Math.min(height, Math.max(0, spaceForPreview));
        const columnBelowPreview = previewDisplayHeight + menuGap + menuCardHeight;
        let previewTop = Math.min(pageY, effectiveBottom - columnBelowPreview);
        previewTop = Math.max(minPreviewTop, previewTop);
        if (previewTop + columnBelowPreview > effectiveBottom) {
          previewTop = Math.max(MENU_EDGE_GAP, effectiveBottom - columnBelowPreview);
        }
        const menuTop = previewTop + previewDisplayHeight + menuGap;
        const menuLeftBase = row.outgoing
          ? previewLeft + previewWidth - MENU_WIDTH
          : previewLeft;
        const menuLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(menuLeftBase, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP),
        );
        setMenuState({
          messageId: row.id,
          isMe: row.outgoing,
          previewTop,
          previewLeft,
          previewWidth,
          previewHeight: previewDisplayHeight,
          menuTop,
          menuLeft,
          placement: 'below',
        });
      });
    },
    [insets.bottom, insets.top, inputBarHeight],
  );

  const handleTelegramMenuAction = useCallback(
    async (key: string) => {
      if (!activeMenuMessage) return;
      switch (key) {
        case 'reply': {
          const id = Number.parseInt(activeMenuMessage.id, 10);
          if (Number.isFinite(id) && id > 0) {
            setReplyToMessageId(id);
          }
          closeMenu();
          return;
        }
        case 'copy': {
          const value = getCopyableContent(activeMenuMessage);
          closeMenu();
          if (!value) {
            Alert.alert('Нечего копировать', 'В этом сообщении нет текста для копирования.');
            return;
          }
          await Clipboard.setStringAsync(value);
          return;
        }
        default:
          return;
      }
    },
    [activeMenuMessage, closeMenu],
  );

  const renderTelegramMenuPreviewBody = useCallback(
    (message: Message, forcedWidth?: number) => {
      const row = messagesRef.current.find((r) => r.id === message.id);
      if (!row) return <View />;
      const fixedWidthStyle = forcedWidth ? { width: forcedWidth, maxWidth: forcedWidth } : undefined;
      const isMe = row.outgoing;
      const replyTarget =
        row.replyToMessageId != null ? messageById.get(row.replyToMessageId) ?? null : null;
      const replySnippet =
        row.replyToMessageId != null ? (
          <ReplyPreview
            author={replyTarget ? (replyTarget.outgoing ? 'Вы' : headerTitle) : 'Исходное сообщение'}
            text={replyTarget ? getTelegramReplyPreviewText(replyTarget) : 'Исходное сообщение недоступно'}
            accentColor={isMe ? withAlpha('#FFFFFF', 0.9) : colors.accent}
            backgroundColor={isMe ? withAlpha('#FFFFFF', 0.12) : colors.inputBackground}
            textColor={isMe ? withAlpha('#FFFFFF', 0.82) : colors.textSecondary}
            authorColor={isMe ? '#FFFFFF' : colors.accent}
            thumbnailUri={getTelegramReplyThumbnailUri(replyTarget)}
          />
        ) : null;
      const senderNameNode =
        !isMe && row.senderName && isGroupChat ? (
          <Text style={styles.senderNameText} numberOfLines={1}>
            {row.senderName}
          </Text>
        ) : null;
      const bubbleHeader =
        senderNameNode || replySnippet ? (
          <>
            {senderNameNode}
            {replySnippet}
          </>
        ) : null;
      const textBubbleColorStyle = isMe ? styles.bubbleMe : styles.bubbleOther;
      const viewCountFormatted =
        row.viewCount != null
          ? row.viewCount >= 1_000_000
            ? `${(row.viewCount / 1_000_000).toFixed(1)}M`
            : row.viewCount >= 1_000
              ? `${(row.viewCount / 1_000).toFixed(1)}K`
              : String(row.viewCount)
          : null;

      if (row.kind === 'voice') {
        if (!row.voiceUri) {
          return (
            <View style={fixedWidthStyle}>
              <View style={[styles.bubble, textBubbleColorStyle]}>
                {bubbleHeader}
                <Text style={[styles.messageText, isMe && styles.messageTextMe]}>Голосовое</Text>
                <MessageTimeStatus
                  time={formatTime(row.dateMs)}
                  status={row.status}
                  isMe={isMe}
                  compact
                  timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
                  iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
                />
              </View>
            </View>
          );
        }
        return (
          <View style={fixedWidthStyle}>
            <VoiceBubble
              uri={row.voiceUri}
              waveform={row.waveform ?? []}
              durationMs={row.durationMs ?? 0}
              isMe={isMe}
              time={formatTime(row.dateMs)}
              status={row.status}
              header={bubbleHeader}
              bubbleMeColor={colors.bubbleMe}
              outgoingTextColor="#FFFFFF"
              outgoingMetaColor={colors.textSecondaryMuted}
              outgoingAccentColor="#FFFFFF"
              incomingBubbleBackground={colors.bubbleOther}
              incomingBubbleBorderColor={colors.bubbleOtherBorder}
              incomingDurationColor={colors.textSecondary}
            />
          </View>
        );
      }

      if (row.kind === 'image' && row.mediaUri) {
        return (
          <View style={fixedWidthStyle}>
            <ImageBubble
              uri={row.mediaUri}
              isMe={isMe}
              width={row.width}
              height={row.height}
              caption={row.text}
              time={formatTime(row.dateMs)}
              status={row.status}
              header={bubbleHeader}
              bubbleMeColor={colors.bubbleMe}
              outgoingTextColor="#FFFFFF"
              incomingBubbleBackground={colors.bubbleOther}
              incomingBubbleBorderColor={colors.bubbleOtherBorder}
              incomingCaptionTextColor={colors.textPrimary}
            />
          </View>
        );
      }

      if (row.kind === 'video' && row.mediaUri) {
        return (
          <View style={fixedWidthStyle}>
            <VideoBubble
              uri={row.mediaUri}
              thumbnailUri={row.thumbnailUri ?? undefined}
              isMe={isMe}
              width={row.width}
              height={row.height}
              durationMs={row.durationMs ?? 0}
              caption={row.text}
              time={formatTime(row.dateMs)}
              status={row.status}
              header={bubbleHeader}
              bubbleMeColor={colors.bubbleMe}
              outgoingTextColor="#FFFFFF"
              incomingBubbleBackground={colors.bubbleOther}
              incomingBubbleBorderColor={colors.bubbleOtherBorder}
              incomingCaptionTextColor={colors.textPrimary}
            />
          </View>
        );
      }

      if (row.kind === 'file') {
        return (
          <View style={[styles.fileBubbleWrap, fixedWidthStyle]}>
            <FileBubble
              fileName={row.fileName ?? 'File'}
              fileSize={row.fileSize}
              uri={row.mediaUri ?? undefined}
              isMe={isMe}
              caption={row.text}
              time={formatTime(row.dateMs)}
              status={row.status}
              header={bubbleHeader}
              bubbleMeColor={colors.bubbleMe}
              outgoingTextColor="#FFFFFF"
              outgoingMetaColor={colors.textSecondaryMuted}
              outgoingAccentColor="#FFFFFF"
              incomingBubbleBackground={colors.bubbleOther}
              incomingBubbleBorderColor={colors.bubbleOtherBorder}
              incomingFileNameColor={colors.textPrimary}
              incomingSecondaryTextColor={colors.textSecondary}
              incomingCaptionColor={colors.textPrimary}
            />
          </View>
        );
      }

      return (
        <View style={fixedWidthStyle}>
          <View style={[styles.bubble, textBubbleColorStyle]}>
            {bubbleHeader}
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{row.text || ' '}</Text>
              {viewCountFormatted ? (
                <Text style={[styles.viewCountText, isMe && styles.viewCountTextMe]}>{`👁 ${viewCountFormatted}`}</Text>
              ) : null}
              <MessageTimeStatus
                time={formatTime(row.dateMs)}
                status={row.status}
                isMe={isMe}
                compact
                timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
                iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
              />
            </View>
          </View>
        </View>
      );
    },
    [colors, headerTitle, isGroupChat, messageById, styles],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: TelegramMessageRow; index: number }) => {
      const isMe = item.outgoing;

      // ── Group-chain detection ──────────────────────────────────────────────
      // messages[] is sorted descending (index 0 = most recent).
      // With inverted FlatList: higher index → displayed higher on screen (older).
      // "above on screen" = messages[index + 1] (older)
      // "below on screen" = messages[index - 1] (newer)
      const msgs = messagesRef.current;
      const isGroupedAbove = isSameGroup(msgs[index + 1], item);
      const isGroupedBelow = isSameGroup(msgs[index - 1], item);
      // The tail (asymmetric corner) belongs to the BOTTOM-most message in the chain.
      const isLastInGroup = !isGroupedBelow;
      const marginTop = isGroupedAbove ? CHAT_MSG_ROW_MARGIN_GROUPED : CHAT_MSG_ROW_MARGIN_ISOLATED;
      const marginBottom = isGroupedBelow ? CHAT_MSG_ROW_MARGIN_GROUPED : CHAT_MSG_ROW_MARGIN_ISOLATED;

      const replyTarget = item.replyToMessageId != null ? messageById.get(item.replyToMessageId) ?? null : null;
      const replySnippet = item.replyToMessageId != null ? (
        <ReplyPreview
          author={replyTarget ? (replyTarget.outgoing ? 'Вы' : headerTitle) : 'Исходное сообщение'}
          text={replyTarget ? getTelegramReplyPreviewText(replyTarget) : 'Исходное сообщение недоступно'}
          accentColor={isMe ? withAlpha('#FFFFFF', 0.9) : colors.accent}
          backgroundColor={isMe ? withAlpha('#FFFFFF', 0.12) : colors.inputBackground}
          textColor={isMe ? withAlpha('#FFFFFF', 0.82) : colors.textSecondary}
          authorColor={isMe ? '#FFFFFF' : colors.accent}
          thumbnailUri={getTelegramReplyThumbnailUri(replyTarget)}
        />
      ) : null;
      const handleOpenMessageMenu = () => {
        openTelegramMessageMenu(item);
      };

      // Sender name header — shown for incoming messages when we have a name and the chat
      // has multiple senders (group / supergroup). Rendered at the top of the bubble.
      const senderNameNode =
        !isMe && item.senderName && isGroupChat ? (
          <Text style={styles.senderNameText} numberOfLines={1}>
            {item.senderName}
          </Text>
        ) : null;

      // Combined bubble header: sender name (if any) + reply snippet (if any).
      // Passed as the `header` prop to media bubble components that already support it.
      const bubbleHeader =
        senderNameNode || replySnippet ? (
          <>
            {senderNameNode}
            {replySnippet}
          </>
        ) : null;

      // View count footer — shown for channel posts.
      const viewCountFormatted =
        item.viewCount != null
          ? item.viewCount >= 1_000_000
            ? `${(item.viewCount / 1_000_000).toFixed(1)}M`
            : item.viewCount >= 1_000
              ? `${(item.viewCount / 1_000).toFixed(1)}K`
              : String(item.viewCount)
          : null;

      // Shared row style: static layout + dynamic group-aware spacing
      const rowStyle = [
        styles.messageRow,
        isMe ? styles.messageRowMe : styles.messageRowOther,
        { marginTop, marginBottom },
      ];
      // Pressable accessibility props shared across all message types
      const pressableA11y = {
        accessibilityRole: 'button' as const,
        accessibilityHint: 'Удерживайте для меню сообщения',
        onLongPress: handleOpenMessageMenu,
        delayLongPress: 260,
      };
      // Text-bubble colour: tail variant (last in group / alone) vs chained (no tail)
      const textBubbleColorStyle = isMe
        ? (isLastInGroup ? styles.bubbleMe : styles.bubbleMeChained)
        : (isLastInGroup ? styles.bubbleOther : styles.bubbleOtherChained);

      if (item.kind === 'voice') {
        if (!item.voiceUri) {
          return (
            <Pressable
              {...pressableA11y}
              style={rowStyle}
              accessibilityLabel={`${isMe ? 'Я' : headerTitle}: голосовое сообщение`}
            >
              <View
                ref={(node) => setMessageContentRef(item.id, node)}
                collapsable={false}
                style={[styles.bubble, textBubbleColorStyle]}
              >
                {bubbleHeader}
                <Text style={[styles.messageText, isMe && styles.messageTextMe]}>Голосовое</Text>
                <MessageTimeStatus
                  time={formatTime(item.dateMs)}
                  status={item.status}
                  isMe={isMe}
                  compact
                  timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
                  iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
                />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable
            {...pressableA11y}
            style={rowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: голосовое сообщение`}
          >
            <View ref={(node) => setMessageContentRef(item.id, node)} collapsable={false}>
              <VoiceBubble
                uri={item.voiceUri}
                waveform={item.waveform ?? []}
                durationMs={item.durationMs ?? 0}
                isMe={isMe}
                time={formatTime(item.dateMs)}
                status={item.status}
                header={bubbleHeader}
                bubbleMeColor={colors.bubbleMe}
                outgoingTextColor="#FFFFFF"
                outgoingMetaColor={colors.textSecondaryMuted}
                outgoingAccentColor="#FFFFFF"
                incomingBubbleBackground={colors.bubbleOther}
                incomingBubbleBorderColor={colors.bubbleOtherBorder}
                incomingDurationColor={colors.textSecondary}
              />
            </View>
          </Pressable>
        );
      }

      if (item.kind === 'image' && item.mediaUri) {
        return (
          <Pressable
            {...pressableA11y}
            style={rowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: фото${item.text ? `, ${item.text}` : ''}`}
          >
            <View ref={(node) => setMessageContentRef(item.id, node)} collapsable={false}>
              <ImageBubble
                uri={item.mediaUri}
                isMe={isMe}
                width={item.width}
                height={item.height}
                caption={item.text}
                time={formatTime(item.dateMs)}
                status={item.status}
                header={bubbleHeader}
                bubbleMeColor={colors.bubbleMe}
                outgoingTextColor="#FFFFFF"
                incomingBubbleBackground={colors.bubbleOther}
                incomingBubbleBorderColor={colors.bubbleOtherBorder}
                incomingCaptionTextColor={colors.textPrimary}
              />
            </View>
          </Pressable>
        );
      }

      if (item.kind === 'video' && item.mediaUri) {
        return (
          <Pressable
            {...pressableA11y}
            style={rowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: видео${item.text ? `, ${item.text}` : ''}`}
          >
            <View ref={(node) => setMessageContentRef(item.id, node)} collapsable={false}>
              <VideoBubble
                uri={item.mediaUri}
                thumbnailUri={item.thumbnailUri ?? undefined}
                isMe={isMe}
                width={item.width}
                height={item.height}
                durationMs={item.durationMs ?? 0}
                caption={item.text}
                time={formatTime(item.dateMs)}
                status={item.status}
                header={bubbleHeader}
                bubbleMeColor={colors.bubbleMe}
                outgoingTextColor="#FFFFFF"
                incomingBubbleBackground={colors.bubbleOther}
                incomingBubbleBorderColor={colors.bubbleOtherBorder}
                incomingCaptionTextColor={colors.textPrimary}
              />
            </View>
          </Pressable>
        );
      }

      if (item.kind === 'file') {
        return (
          <Pressable
            {...pressableA11y}
            style={rowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: файл ${item.fileName ?? ''}`}
          >
            <View ref={(node) => setMessageContentRef(item.id, node)} collapsable={false} style={styles.fileBubbleWrap}>
              <FileBubble
                fileName={item.fileName ?? 'File'}
                fileSize={item.fileSize}
                uri={item.mediaUri ?? undefined}
                isMe={isMe}
                caption={item.text}
                time={formatTime(item.dateMs)}
                status={item.status}
                header={bubbleHeader}
                bubbleMeColor={colors.bubbleMe}
                outgoingTextColor="#FFFFFF"
                outgoingMetaColor={colors.textSecondaryMuted}
                outgoingAccentColor="#FFFFFF"
                incomingBubbleBackground={colors.bubbleOther}
                incomingBubbleBorderColor={colors.bubbleOtherBorder}
                incomingFileNameColor={colors.textPrimary}
                incomingSecondaryTextColor={colors.textSecondary}
                incomingCaptionColor={colors.textPrimary}
              />
            </View>
          </Pressable>
        );
      }

      return (
        <Pressable
          {...pressableA11y}
          style={rowStyle}
          accessibilityLabel={`${isMe ? 'Я' : headerTitle}: ${item.text || 'сообщение'}`}
        >
          <View
            ref={(node) => setMessageContentRef(item.id, node)}
            collapsable={false}
            style={[styles.bubble, textBubbleColorStyle]}
          >
            {bubbleHeader}
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.text || ' '}</Text>
              {viewCountFormatted ? (
                <Text style={[styles.viewCountText, isMe && styles.viewCountTextMe]}>
                  {`👁 ${viewCountFormatted}`}
                </Text>
              ) : null}
              <MessageTimeStatus
                time={formatTime(item.dateMs)}
                status={item.status}
                isMe={isMe}
                compact
                timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
                iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
              />
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, headerTitle, isGroupChat, messageById, openTelegramMessageMenu, setMessageContentRef, styles],
  );

  return (
    <View style={{ flex: 1 }}>
    <KeyboardAvoidingView
      // Android inherits window soft resize from the host Activity (`adjustResize`), so RN's KeyboardAvoidingView
      // is unnecessary and tends to conflict; iOS keeps the composer readable with measured header offset.
      style={{ flex: 1, backgroundColor: colors.chatBackground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeightNav : 0}
    >
      <View style={styles.flexChatBody}>
        <View style={styles.wallpaperLayer} pointerEvents="none">
          <ChatBackgroundPattern themeId={wallpaperThemeId} />
        </View>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          style={styles.messagesList}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshing={loading}
          onRefresh={() => void loadHistory(false)}
          onEndReached={() => void loadHistory(true)}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {lastError ?? (loading ? 'Загружаем историю Telegram...' : 'История пуста')}
              </Text>
            </View>
          }
        />
        <View
          style={[styles.bottomChrome, { paddingBottom: insets.bottom }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setInputBarHeight(Math.ceil(h));
          }}
        >
          {loadingOlder ? (
            <Text style={styles.loadingOlder}>Загружаем старые сообщения...</Text>
          ) : null}
          {canPost ? (
            <InputBar
              onSendText={sendText}
              onSendVoice={sendVoice}
              onSendMedia={sendMedia}
              onSendFile={sendFile}
              replyToMessage={replyToInputMessage}
              replyAuthorName={replyAuthorName}
              onCancelReply={() => setReplyToMessageId(null)}
              placeholder="Сообщение"
            />
          ) : (
            <View style={styles.readOnlyFooter} accessibilityLabel="Только для чтения">
              <Text style={styles.readOnlyText}>Только для чтения</Text>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
    <ChatContextMenuOverlay
      menuState={menuState}
      activeMenuMessage={activeMenuMessage}
      menuActions={telegramMenuActions}
      menuAnim={menuAnim}
      screenWidth={SCREEN_WIDTH}
      showReactions={false}
      onClose={closeMenu}
      onMenuAction={handleTelegramMenuAction}
      renderMenuPreviewBody={renderTelegramMenuPreviewBody}
    />
    </View>
  );
}

function createTelegramStackHeaderPresentationStyles(colors: ThemeColors) {
  const subtitleKey = chatHeaderPresentation.subtitleColorKey;
  return StyleSheet.create({
    pressableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    pressablePressed: {
      opacity: 0.7,
    },
    avatar: {
      width: CHAT_HEADER_AVATAR_SIZE,
      height: CHAT_HEADER_AVATAR_SIZE,
      borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
      marginRight: 10,
    },
    avatarPlaceholder: {
      width: CHAT_HEADER_AVATAR_SIZE,
      height: CHAT_HEADER_AVATAR_SIZE,
      borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    avatarPlaceholderLetter: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    titleWrap: {
      flexShrink: 1,
      justifyContent: 'center',
    },
    headerTitleText: {
      fontSize: chatHeaderPresentation.titleFontSize,
      fontWeight: chatHeaderPresentation.titleFontWeight,
      color: colors.textPrimary,
    },
    headerSubtitleText: {
      marginTop: 1,
      fontSize: chatHeaderPresentation.subtitleFontSize,
      color: colors[subtitleKey],
    },
  });
}

function createTelegramChatStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flexChatBody: {
      flex: 1,
      backgroundColor: colors.chatBackground,
    },
    wallpaperLayer: StyleSheet.absoluteFillObject,
    messagesList: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    bottomChrome: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      backgroundColor: colors.composerSurface,
    },
    listContent: {
      paddingHorizontal: CHAT_MSG_HORIZONTAL_PADDING,
      paddingTop: CHAT_MSG_VERTICAL_PADDING,
      paddingBottom: CHAT_MSG_VERTICAL_PADDING,
    },
    messageRow: {
      // marginVertical is overridden per-row by group-aware inline style
      marginVertical: CHAT_MSG_ROW_MARGIN_ISOLATED,
      flexDirection: 'row',
    },
    messageRowMe: {
      justifyContent: 'flex-end',
    },
    messageRowOther: {
      justifyContent: 'flex-start',
    },
    bubble: {
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    /** Last (most-recent) or standalone outgoing message — shows the corner tail. */
    bubbleMe: {
      backgroundColor: colors.bubbleMe,
      borderBottomRightRadius: 6,
    },
    /** Outgoing message inside a chain (not the last one) — fully rounded, no tail. */
    bubbleMeChained: {
      backgroundColor: colors.bubbleMe,
    },
    /** Last (most-recent) or standalone incoming message — shows the corner tail. */
    bubbleOther: {
      backgroundColor: colors.bubbleOther,
      borderBottomLeftRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.bubbleOtherBorder,
    },
    /** Incoming message inside a chain (not the last one) — fully rounded, no tail. */
    bubbleOtherChained: {
      backgroundColor: colors.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.bubbleOtherBorder,
    },
    messageText: {
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 21,
      flexShrink: 1,
    },
    messageTextMe: {
      color: '#FFFFFF',
    },
    bubbleContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      columnGap: 6,
    },
    fileBubbleWrap: {
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
      minWidth: 220,
    },
    empty: {
      padding: 24,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    loadingOlder: {
      paddingVertical: 4,
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 12,
    },
    /** Sender name shown at the top of an incoming bubble in group/supergroup chats. */
    senderNameText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 2,
    },
    /** View count for channel posts (alongside time/status). */
    viewCountText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    viewCountTextMe: {
      color: colors.textSecondaryMuted,
    },
    /** Read-only footer shown for channels where the user cannot post. */
    readOnlyFooter: {
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.toolbar,
    },
    readOnlyText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
  });
}

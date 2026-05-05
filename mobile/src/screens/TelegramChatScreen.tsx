import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import type { VoiceRecordingResult } from '../services/VoiceRecorderService';
import { uiStore } from '../stores/uiStore';
import { DEFAULT_CHAT_THEME_ID } from '../theme/chatThemes';
import { withAlpha } from '../theme/stylePrimitives';
import { ChatBackgroundPattern, SCREEN_WIDTH } from './chatScreen.shared';
import {
  CHAT_MSG_GROUP_TIME_GAP_MS,
  CHAT_MSG_ROW_MARGIN_GROUPED,
  CHAT_MSG_ROW_MARGIN_ISOLATED,
} from '../presentation/telegramChatUi';
import {
  fileUriToPath,
  formattedText,
  formatTime,
  getInputReplyTo,
  getLocalInputFile,
} from './telegramChat/composer';
import {
  applyReadOutboxStatus,
  getTelegramReplyPreviewText,
  getTelegramReplyThumbnailUri,
  isSameGroup,
  markMessageFailed,
  optimisticOutgoingMessage,
  telegramRowToInputReplyMessage,
  upsertMessage,
} from './telegramChat/messageRow';
import {
  createTelegramChatStyles,
  createTelegramStackHeaderPresentationStyles,
} from './telegramChat/telegramChatStyles';
import {
  getLastReadOutboxMessageId,
  getNestedRecord,
  loadLastReadOutboxMessageId,
  mapTdMessage,
  mapTdMessages,
} from './telegramChat/tdlibMapping';
import type { TelegramMessageRow } from './telegramChat/types';
import { useTelegramChatMenu } from './telegramChat/useTelegramChatMenu';

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
  const [canPost, setCanPost] = useState(true);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const oldestMessageIdRef = useRef<number>(0);
  const lastReadOutboxMessageIdRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const messagesRef = useRef<TelegramMessageRow[]>([]);
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

  const {
    menuState,
    menuAnim,
    telegramMenuActions,
    activeMenuMessage,
    setMessageContentRef,
    closeMenu,
    openTelegramMessageMenu,
    handleTelegramMenuAction,
    renderTelegramMenuPreviewBody,
  } = useTelegramChatMenu({
    chatId,
    messages,
    messagesRef,
    messageById,
    colors,
    styles,
    headerTitle,
    isGroupChat,
    inputBarHeight,
    insets,
    setReplyToMessageId,
  });

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
        const type = getNestedRecord(chat.type);
        const isBroadcastChannel =
          type?.['@type'] === 'chatTypeSupergroup' && type?.is_channel === true;
        const perms = getNestedRecord(chat.permissions);
        if (!cancelled) {
          setCanPost(!isBroadcastChannel || perms?.can_send_basic_messages !== false);
        }
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
        /* best-effort */
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

  const renderItem = useCallback(
    ({ item, index }: { item: TelegramMessageRow; index: number }) => {
      const isMe = item.outgoing;

      const msgs = messagesRef.current;
      const isGroupedAbove = isSameGroup(msgs[index + 1], item);
      const isGroupedBelow = isSameGroup(msgs[index - 1], item);
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

      const senderNameNode =
        !isMe && item.senderName && isGroupChat ? (
          <Text style={styles.senderNameText} numberOfLines={1}>
            {item.senderName}
          </Text>
        ) : null;

      const bubbleHeader =
        senderNameNode || replySnippet ? (
          <>
            {senderNameNode}
            {replySnippet}
          </>
        ) : null;

      const viewCountFormatted =
        item.viewCount != null
          ? item.viewCount >= 1_000_000
            ? `${(item.viewCount / 1_000_000).toFixed(1)}M`
            : item.viewCount >= 1_000
              ? `${(item.viewCount / 1_000).toFixed(1)}K`
              : String(item.viewCount)
          : null;

      const rowStyle = [
        styles.messageRow,
        isMe ? styles.messageRowMe : styles.messageRowOther,
        { marginTop, marginBottom },
      ];
      const pressableA11y = {
        accessibilityRole: 'button' as const,
        accessibilityHint: 'Удерживайте для меню сообщения',
        onLongPress: handleOpenMessageMenu,
        delayLongPress: 260,
      };
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

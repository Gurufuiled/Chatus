import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { ChatsStackParamList } from '../navigation/types';
import { InputBar } from '../components/InputBar';
import { MessageTimeStatus } from '../components/MessageTimeStatus';
import { VoiceBubble } from '../components/VoiceBubble';
import { useTheme } from '../contexts/ThemeContext';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import type { VoiceRecordingResult } from '../services/VoiceRecorderService';
import type { ThemeColors } from '../theme/palettes';

type TelegramMessageKind = 'text' | 'voice' | 'service';
type TelegramMessageStatus = 'sending' | 'sent' | 'read' | 'failed';

type TelegramMessageRow = {
  id: string;
  messageId: number;
  kind: TelegramMessageKind;
  text: string;
  outgoing: boolean;
  dateMs: number;
  status: TelegramMessageStatus;
  voiceUri?: string | null;
  durationMs?: number;
  waveform?: number[];
};

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function fileUriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
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
  const base = {
    id: String(id),
    messageId: id,
    outgoing,
    dateMs: dateSec * 1000,
    status: getTdMessageStatus(raw, lastReadOutboxMessageId),
  };

  if (kind === 'messageText') {
    const text = getNestedRecord(content.text);
    return {
      ...base,
      kind: 'text',
      text: typeof text?.text === 'string' ? text.text : '',
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

  return {
    ...base,
    kind: 'service',
    text: previewForUnsupported(kind),
  };
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
  const { colors } = useTheme();
  const styles = useMemo(() => createTelegramChatStyles(colors), [colors]);
  const route = useRoute<RouteProp<ChatsStackParamList, 'TelegramChat'>>();
  const { telegramChatId, title, avatarUri } = route.params;
  const chatId = useMemo(() => Number.parseInt(telegramChatId, 10), [telegramChatId]);
  const [messages, setMessages] = useState<TelegramMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const oldestMessageIdRef = useRef<number>(0);
  const lastReadOutboxMessageIdRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const headerTitle = useMemo(() => title || `Telegram ${telegramChatId}`, [telegramChatId, title]);

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
        const mapped = (
          await Promise.all(
            rawMessages
              .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
              .map((item) => mapTdMessage(item, lastReadOutboxMessageIdRef.current)),
          )
        ).filter((item): item is TelegramMessageRow => item != null);

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
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'text',
        text: trimmed,
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
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
    [chatId, ensureReady],
  );

  const sendVoice = useCallback(
    async (result: VoiceRecordingResult) => {
      if (!Number.isFinite(chatId)) return;
      const tempId = -Date.now();
      const localPath = fileUriToPath(result.uri);
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'voice',
        text: 'Голосовое',
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        voiceUri: result.uri,
        durationMs: result.durationMs,
        waveform: result.waveform,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
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
    [chatId, ensureReady],
  );

  const renderItem = useCallback(
    ({ item }: { item: TelegramMessageRow }) => {
      const isMe = item.outgoing;
      if (item.kind === 'voice') {
        if (!item.voiceUri) {
          return (
            <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                <Text style={[styles.messageText, isMe && styles.messageTextMe]}>Голосовое</Text>
                <MessageTimeStatus
                  time={formatTime(item.dateMs)}
                  status={item.status}
                  isMe={isMe}
                  compact
                  timeColor={isMe ? 'rgba(255,255,255,0.72)' : colors.textSecondary}
                  iconColor={isMe ? 'rgba(255,255,255,0.72)' : colors.textSecondary}
                />
              </View>
            </View>
          );
        }
        return (
          <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
            <VoiceBubble
              uri={item.voiceUri}
              waveform={item.waveform ?? []}
              durationMs={item.durationMs ?? 0}
              isMe={isMe}
              time={formatTime(item.dateMs)}
              status={item.status}
              bubbleMeColor={colors.bubbleMe}
              outgoingTextColor="#FFFFFF"
              outgoingMetaColor="rgba(255,255,255,0.72)"
              outgoingAccentColor="#FFFFFF"
              incomingBubbleBackground={colors.bubbleOther}
              incomingBubbleBorderColor={colors.bubbleOtherBorder}
              incomingDurationColor={colors.textSecondary}
            />
          </View>
        );
      }

      return (
        <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.text || ' '}</Text>
              <MessageTimeStatus
                time={formatTime(item.dateMs)}
                status={item.status}
                isMe={isMe}
                compact
                timeColor={isMe ? 'rgba(255,255,255,0.72)' : colors.textSecondary}
                iconColor={isMe ? 'rgba(255,255,255,0.72)' : colors.textSecondary}
              />
            </View>
          </View>
        </View>
      );
    },
    [colors, styles],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.chatBackground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerHint}>
        {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.headerAvatar} /> : null}
        <Text style={styles.headerHintText} numberOfLines={1}>
          {headerTitle}
        </Text>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        inverted
        contentContainerStyle={styles.listContent}
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
      {loadingOlder ? <Text style={styles.loadingOlder}>Загружаем старые сообщения...</Text> : null}
      <InputBar
        onSendText={sendText}
        onSendVoice={sendVoice}
        mediaRestriction="В Telegram-режиме сейчас доступны текст и голосовые."
        placeholder="Сообщение"
      />
    </KeyboardAvoidingView>
  );
}

function createTelegramChatStyles(colors: ThemeColors) {
  return StyleSheet.create({
    headerHint: {
      minHeight: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
      backgroundColor: colors.toolbar,
    },
    headerAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      marginRight: 8,
    },
    headerHintText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 12,
    },
    listContent: {
      paddingHorizontal: 10,
      paddingTop: 12,
      paddingBottom: 12,
    },
    messageRow: {
      marginVertical: 3,
      flexDirection: 'row',
    },
    messageRowMe: {
      justifyContent: 'flex-end',
    },
    messageRowOther: {
      justifyContent: 'flex-start',
    },
    bubble: {
      maxWidth: '84%',
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bubbleMe: {
      backgroundColor: colors.bubbleMe,
      borderBottomRightRadius: 6,
    },
    bubbleOther: {
      backgroundColor: colors.bubbleOther,
      borderBottomLeftRadius: 6,
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
  });
}

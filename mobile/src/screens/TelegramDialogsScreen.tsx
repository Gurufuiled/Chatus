import React, { useCallback, useMemo, useRef } from 'react';
import { FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { telegramAccountStore, type TelegramChatType, type TelegramDialogRow } from '../stores/telegramAccountStore';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import { createChatListRowStyles } from '../components/chatListRow.styles';
import { buildChatRowLoadFailure } from './telegramChat/telegramDialogFallback';

const AVATAR_COLORS = ['#5B8DEF', '#53B7A8', '#F2994A', '#BB6BD9', '#EB5757', '#2D9CDB'];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatChatTime(timestamp: number | null | undefined) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function previewFromChat(chat: Record<string, unknown>): string {
  const last = chat.last_message as Record<string, unknown> | undefined;
  if (!last) return '';
  const c = last.content as Record<string, unknown> | undefined;
  if (!c) return '';
  const kind = c['@type'] as string | undefined;
  if (kind === 'messageText') {
    const text = (c.text as { text?: string } | undefined)?.text;
    return text?.trim() ?? '';
  }
  if (kind === 'messagePhoto') return 'Фото';
  if (kind === 'messageVideo') return 'Видео';
  if (kind === 'messageDocument') return 'Файл';
  if (kind === 'messageVoiceNote') return 'Голосовое';
  if (kind === 'messageSticker') return 'Стикер';
  return '';
}

function titleFromChat(chat: Record<string, unknown>, chatId: number): string {
  const t = typeof chat.title === 'string' ? chat.title.trim() : '';
  if (t) return t;
  return `Чат ${chatId}`;
}

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * Resolves the TDLib `chat.type` object into our simplified `TelegramChatType`
 * plus the internal group/supergroup id if present (used for member-count queries).
 */
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

async function loadChatRow(chatId: number, previous?: TelegramDialogRow): Promise<TelegramDialogRow> {
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
    // Run avatar download and member-count fetch in parallel to keep row load time low.
    const [avatarUri, memberCount] = await Promise.all([
      avatarFileId != null ? getLocalFilePath(avatarFileId).catch(() => null) : Promise.resolve(null),
      loadMemberCount(supergroupId, basicGroupId),
    ]);
    return {
      id: idStr,
      chatId: idStr,
      title: titleFromChat(chat, chatId),
      lastMessagePreview: previewFromChat(chat),
      avatarUri,
      lastMessageAt: date,
      unreadCount,
      chatType,
      memberCount,
    };
  } catch {
    return buildChatRowLoadFailure(chatId, previous);
  }
}

export function TelegramDialogsScreen() {
  const { colors } = useTheme();
  const rowStyles = useMemo(() => createChatListRowStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const dialogs = telegramAccountStore((s) => s.dialogs);
  const [refreshing, setRefreshing] = React.useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
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
        telegramAccountStore.getState().setLastError(`Ожидался chats, пришло: ${String(res['@type'])}`);
        return;
      }
      const rawIds = res.chat_ids as unknown;
      const ids = Array.isArray(rawIds)
        ? rawIds.map((x) => (typeof x === 'number' ? x : Number.parseInt(String(x), 10))).filter((n) => Number.isFinite(n))
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      telegramAccountStore.getState().setLastError(msg);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, 500);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const unsub = tdlibClient.subscribe((json) => {
        try {
          const u = JSON.parse(json) as { '@type'?: string };
          const t = u['@type'] ?? '';
          if (
            t === 'updateNewChat' ||
            t === 'updateChatLastMessage' ||
            t === 'updateChatPosition' ||
            t === 'updateChatReadInbox' ||
            t === 'updateChatTitle' ||
            t === 'updateDeleteMessages'
          ) {
            scheduleRefresh();
          }
        } catch {
          /* ignore */
        }
      });
      return () => {
        unsub();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
      };
    }, [refresh, scheduleRefresh]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const lastError = telegramAccountStore((s) => s.lastError);

  const renderItem = useCallback(
    ({ item }: { item: TelegramDialogRow }) => {
      const isChannel = item.chatType === 'channel';
      const isGroup = item.chatType === 'group' || item.chatType === 'supergroup';
      // Subtitle shown below the title: member/subscriber count for groups & channels
      const subtitle = (() => {
        if (item.memberCount != null && item.memberCount > 0) {
          return isChannel
            ? `${item.memberCount.toLocaleString()} подписчиков`
            : `${item.memberCount.toLocaleString()} участников`;
        }
        return item.lastMessagePreview;
      })();

      const rowNavParams = {
        telegramChatId: item.chatId,
        title: item.title,
        avatarUri: item.avatarUri ?? null,
        chatType: item.chatType ?? null,
      };

      return (
        <View style={rowStyles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Профиль: ${item.title}`}
            accessibilityHint="Открывает экран профиля чата или канала"
            onPress={() => navigation.navigate('TelegramChatProfile', rowNavParams)}
          >
            {item.avatarUri ? (
              <Image source={{ uri: item.avatarUri }} style={rowStyles.avatar} />
            ) : (
              <View
                style={[
                  rowStyles.avatarPlaceholder,
                  isChannel ? rowStyles.channelAvatarPlaceholder : { backgroundColor: getAvatarColor(item.title) },
                ]}
              >
                <Text style={rowStyles.avatarPlaceholderText}>
                  {isChannel ? '📢' : (item.title.trim()[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('TelegramChat', rowNavParams)}
            style={({ pressed }) => [rowStyles.content, pressed && rowStyles.rowPressed]}
          >
            <View style={rowStyles.topRow}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={rowStyles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                {isChannel ? (
                  <Text style={{ fontSize: 11, color: colors.accent }}>канал</Text>
                ) : isGroup ? (
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>группа</Text>
                ) : null}
              </View>
              {item.lastMessageAt || item.unreadCount ? (
                <View style={rowStyles.metaColumn}>
                  {item.lastMessageAt ? (
                    <Text style={rowStyles.timeLabel}>{formatChatTime(item.lastMessageAt)}</Text>
                  ) : null}
                  {item.unreadCount ? (
                    <View style={[rowStyles.unreadBadge, item.unreadCount > 99 && rowStyles.unreadBadgeWide]}>
                      <Text style={rowStyles.unreadBadgeText}>
                        {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            {subtitle ? (
              <Text style={rowStyles.preview} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [colors.accent, colors.textSecondary, navigation, rowStyles],
  );

  const empty = useMemo(
    () => (
      <View style={{ padding: 24 }}>
        {lastError ? (
          <Text style={{ color: '#E53935', textAlign: 'center', marginBottom: 12 }}>{lastError}</Text>
        ) : null}
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
          Список чатов пуст. Если аккаунт только что подключили, подождите синхронизацию и потяните список вниз
          для обновления.
        </Text>
      </View>
    ),
    [colors.textSecondary, lastError],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBackground }}>
      <FlatList
        data={dialogs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 84, backgroundColor: colors.separator }} />}
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.accent} />
        }
      />
    </View>
  );
}

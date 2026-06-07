import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import {
  tdlibSendChatActionCancel,
  tdlibSendChatActionTyping,
} from './tdlibChatActions';
import {
  buildTelegramMemberCountSubtitle,
  formatTelegramTypingLabel,
  isTelegramCancelChatAction,
  isTelegramTypingChatAction,
  parseUpdateUserChatAction,
  pruneTelegramTypingUsers,
  TELEGRAM_TYPING_SEND_INTERVAL_MS,
  TELEGRAM_TYPING_TTL_MS,
  type TelegramTypingUser,
} from './telegramChatTyping';

const userDisplayNameCache = new Map<number, string>();

async function resolveTdlibUserDisplayName(userId: number): Promise<string> {
  const cached = userDisplayNameCache.get(userId);
  if (cached) return cached;

  const raw = (await tdlibClient.send({
    '@type': 'getUser',
    user_id: userId,
  })) as Record<string, unknown>;
  throwIfTdError(raw);
  const first = typeof raw.first_name === 'string' ? raw.first_name.trim() : '';
  const last = typeof raw.last_name === 'string' ? raw.last_name.trim() : '';
  const displayName = [first, last].filter(Boolean).join(' ') || `User ${userId}`;
  userDisplayNameCache.set(userId, displayName);
  return displayName;
}

type Options = {
  chatId: number;
  isFocused: boolean;
  isGroupChat: boolean;
  isChannel: boolean;
  memberCount: number | null;
  messageThreadId?: number;
};

export function useTelegramChatHeaderSubtitle({
  chatId,
  isFocused,
  isGroupChat,
  isChannel,
  memberCount,
  messageThreadId = 0,
}: Options) {
  const typingUsersRef = useRef(new Map<number, TelegramTypingUser>());
  const [typingRevision, setTypingRevision] = useState(0);
  const selfUserIdRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const composerHasTextRef = useRef(false);

  const bumpTyping = useCallback(() => {
    setTypingRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void tdlibClient
      .send({ '@type': 'getMe' })
      .then((raw) => {
        if (cancelled) return;
        const me = raw as Record<string, unknown>;
        const id = typeof me.id === 'number' ? me.id : null;
        selfUserIdRef.current = id;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(chatId) || !isFocused) {
      typingUsersRef.current.clear();
      bumpTyping();
      return;
    }

    const unsubscribe = tdlibClient.subscribe((update) => {
      const parsed = parseUpdateUserChatAction(update);
      if (!parsed || parsed.chatId !== chatId) return;
      if (parsed.userId === selfUserIdRef.current) return;

      if (isTelegramCancelChatAction(parsed.actionType)) {
        if (typingUsersRef.current.delete(parsed.userId)) {
          bumpTyping();
        }
        return;
      }

      if (!isTelegramTypingChatAction(parsed.actionType)) return;

      const existing = typingUsersRef.current.get(parsed.userId);
      const expiresAt = Date.now() + TELEGRAM_TYPING_TTL_MS;
      if (existing) {
        existing.expiresAt = expiresAt;
        bumpTyping();
        return;
      }

      typingUsersRef.current.set(parsed.userId, {
        userId: parsed.userId,
        displayName: '',
        expiresAt,
      });
      bumpTyping();

      void resolveTdlibUserDisplayName(parsed.userId)
        .then((displayName) => {
          const entry = typingUsersRef.current.get(parsed.userId);
          if (!entry) return;
          entry.displayName = displayName;
          bumpTyping();
        })
        .catch(() => {});
    });

    return () => {
      unsubscribe();
      typingUsersRef.current.clear();
      bumpTyping();
    };
  }, [bumpTyping, chatId, isFocused]);

  useEffect(() => {
    if (!isFocused || !Number.isFinite(chatId)) return;
    const timer = setInterval(() => {
      const before = typingUsersRef.current.size;
      pruneTelegramTypingUsers(typingUsersRef.current);
      if (typingUsersRef.current.size !== before) {
        bumpTyping();
      }

      if (composerHasTextRef.current) {
        const now = Date.now();
        if (now - lastTypingSentAtRef.current >= TELEGRAM_TYPING_SEND_INTERVAL_MS) {
          lastTypingSentAtRef.current = now;
          void tdlibSendChatActionTyping(chatId, messageThreadId).catch(() => {});
        }
      }
    }, 2_000);
    return () => clearInterval(timer);
  }, [bumpTyping, chatId, isFocused, messageThreadId]);

  const cancelOwnTyping = useCallback(() => {
    if (!Number.isFinite(chatId)) return;
    composerHasTextRef.current = false;
    lastTypingSentAtRef.current = 0;
    void tdlibSendChatActionCancel(chatId, messageThreadId).catch(() => {});
  }, [chatId, messageThreadId]);

  useEffect(() => {
    if (isFocused) return;
    cancelOwnTyping();
  }, [cancelOwnTyping, isFocused]);

  const onComposerTextChange = useCallback(
    (text: string) => {
      if (!Number.isFinite(chatId) || !isFocused) return;
      const trimmed = text.trim();
      if (!trimmed) {
        if (composerHasTextRef.current) {
          cancelOwnTyping();
        }
        return;
      }

      composerHasTextRef.current = true;
      const now = Date.now();
      if (now - lastTypingSentAtRef.current < TELEGRAM_TYPING_SEND_INTERVAL_MS) {
        return;
      }
      lastTypingSentAtRef.current = now;
      void tdlibSendChatActionTyping(chatId, messageThreadId).catch(() => {});
    },
    [cancelOwnTyping, chatId, isFocused, messageThreadId],
  );

  const onComposerMessageSent = useCallback(() => {
    cancelOwnTyping();
  }, [cancelOwnTyping]);

  const headerSubtitle = useMemo(() => {
    void typingRevision;
    pruneTelegramTypingUsers(typingUsersRef.current);
    const typingUsers = [...typingUsersRef.current.values()].sort((a, b) => {
      const nameA = a.displayName || `User ${a.userId}`;
      const nameB = b.displayName || `User ${b.userId}`;
      return nameA.localeCompare(nameB, 'ru');
    });
    const typingLabel = formatTelegramTypingLabel(typingUsers, isGroupChat);
    if (typingLabel) return typingLabel;
    return buildTelegramMemberCountSubtitle(memberCount, isChannel);
  }, [isChannel, isGroupChat, memberCount, typingRevision]);

  return {
    headerSubtitle,
    onComposerTextChange,
    onComposerMessageSent,
  };
}

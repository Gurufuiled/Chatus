import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import {
  useForwardMessagesMutation,
  useMarkChatReadMutation,
  useMessagesQuery,
  usePinMessageMutation,
} from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { resolveMediaUrl } from '@/services/mediaService';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import { ForwardDialog } from '@/features/conversation/ForwardDialog';
import { PinnedMessageBar } from '@/features/conversation/PinnedMessageBar';
import { getOutgoingMessagePreview } from '@/features/conversation/messageFormatters';
import { canPinMessages } from '@/utils/chatPermissions';
import { MobileChatHeader } from '../components/MobileChatHeader';
import { MobileMessageList } from '../components/MobileMessageList';
import { MobileMessageComposer } from '../components/MobileMessageComposer';
import { MobileMessageContextMenu } from '../components/MobileMessageContextMenu';
import { MobilePlaybackBanner } from '../components/MobilePlaybackBanner';
import { useMobileComposerKeyboard } from '../utils/useMobileComposerKeyboard';
import { VoicePlayerService } from '@/features/conversation/voicePlayerService';
import { stopActiveVideoNotePlayback } from '@/features/conversation/videoNotePlayerService';

interface MobileChatScreenProps {
  chatId: string;
}

export function MobileChatScreen({ chatId }: MobileChatScreenProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading: chatsLoading } = useChatsQuery();
  const { data: messages, isLoading: messagesLoading } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const { mutate: markChatRead } = useMarkChatReadMutation();
  const forwardMutation = useForwardMessagesMutation();
  const pinMutation = usePinMessageMutation();
  const markedRef = useRef<string | null>(null);
  const chat = chats?.find((c) => c.id === chatId);

  const pinnedMessageId = chat?.pinned_message_id ?? null;
  const pinnedMessage = useMemo(
    () =>
      pinnedMessageId
        ? (messages ?? []).find((m) => m.id === pinnedMessageId) ?? null
        : null,
    [messages, pinnedMessageId],
  );
  const canUnpin = canPinMessages(chat, me);

  useEffect(() => {
    if (!chat || chat.chat_type !== 'channel') return;
    navigate({ to: '/channel/$channelId', params: { channelId: chat.id }, replace: true });
  }, [chat, navigate]);
  const { keyboardLift, composerPaddingBottom, triggerPreLift } = useMobileComposerKeyboard();
  const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
  const closeForward = useCallback(() => setForwardMessageIds([]), []);

  const handleForwardToChat = useCallback(
    (targetChatIds: string[], caption?: string) => {
      if (forwardMessageIds.length === 0) return;
      forwardMutation.mutate(
        {
          sourceChatId: chatId,
          targetChatIds,
          messageIds: forwardMessageIds,
          caption,
        },
        { onSuccess: closeForward },
      );
    },
    [chatId, closeForward, forwardMessageIds, forwardMutation],
  );

  useEffect(() => {
    markedRef.current = null;
  }, [chatId]);

  useEffect(() => {
    if (!chat || chat.unread_count === 0) return;
    if (markedRef.current === chatId) return;
    markedRef.current = chatId;
    markChatRead(chatId);
  }, [chatId, chat, markChatRead]);

  useEffect(() => {
    return () => {
      void VoicePlayerService.stop();
      stopActiveVideoNotePlayback();
    };
  }, [chatId]);

  const resolveVoiceAuthor = useCallback(
    (uri: string) => {
      const match = messages?.find((message) => {
        if (message.msg_type !== 'voice') return false;
        const remote = message.media?.[0]?.remote_url;
        return remote ? resolveMediaUrl(remote) === uri : false;
      });
      return match?.sender_name?.trim() || chat?.name || null;
    },
    [chat?.name, messages],
  );

  const resolveVideoNoteAuthor = useCallback(
    (messageId: string | null, uri: string | null) => {
      if (messageId) {
        const direct = messages?.find((m) => m.id === messageId);
        if (direct?.sender_name?.trim()) return direct.sender_name.trim();
      }
      if (uri) {
        const match = messages?.find((message) => {
          if (message.msg_type !== 'video_note') return false;
          const remote = message.media?.[0]?.remote_url;
          return remote ? resolveMediaUrl(remote) === uri : false;
        });
        if (match?.sender_name?.trim()) return match.sender_name.trim();
      }
      return chat?.name || null;
    },
    [chat?.name, messages],
  );

  const banner = useMemo(
    () => (
      <MobilePlaybackBanner
        resolveVoiceAuthor={resolveVoiceAuthor}
        resolveVideoNoteAuthor={resolveVideoNoteAuthor}
      />
    ),
    [resolveVideoNoteAuthor, resolveVoiceAuthor],
  );

  if (chatsLoading) {
    return (
      <div
        className="mobile-chat"
        style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
      >
        <div className="mobile-chat__messages-loading">Загрузка…</div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div
        className="mobile-chat"
        style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
      >
        <header className="mobile-chat__header">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад к списку чатов"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat__title">Чат не найден</span>
        </header>
        <p className="mobile-chat__messages-empty">Возможно, диалог был удалён</p>
      </div>
    );
  }

  return (
    <div
      className="mobile-chat"
      style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <MobileChatHeader chat={chat} />
      {banner}
      {pinnedMessageId ? (
        <PinnedMessageBar
          preview={
            pinnedMessage
              ? getOutgoingMessagePreview(pinnedMessage) || 'Сообщение'
              : 'Закреплённое сообщение'
          }
          canUnpin={canUnpin}
          onPress={() => {
            document
              .getElementById(`msg-${pinnedMessageId}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onUnpin={() => {
            if (!canUnpin) return;
            pinMutation.mutate({ chatId, messageId: null });
          }}
        />
      ) : null}
      <MobileMessageList chatId={chatId} keyboardLift={keyboardLift} isGroupChat={chat.chat_type === 'group'} />
      <MobileMessageComposer
        chatId={chatId}
        disabled={messagesLoading}
        keyboardLift={keyboardLift}
        composerPaddingBottom={composerPaddingBottom}
        onComposerPointerDown={triggerPreLift}
      />
      <MobileMessageContextMenu
        chatId={chatId}
        onForward={(messageIds) => setForwardMessageIds(messageIds)}
      />
      <ForwardDialog
        open={forwardMessageIds.length > 0}
        sourceChatId={chatId}
        pending={forwardMutation.isPending}
        onClose={closeForward}
        onForward={handleForwardToChat}
      />
    </div>
  );
}

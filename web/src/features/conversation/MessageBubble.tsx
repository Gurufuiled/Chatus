import { ChatStatusChecks } from '@/features/chat-list/ChatStatusChecks';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import { resolveMediaUrl } from '@/services/mediaService';
import { formatMessageTime } from './messageFormatters';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import { isAlbumCaption, isAlbumMessage } from '@/utils/albumCaption';
import { parseGroupCallSystemContent } from '@/utils/groupCallSystemMessage';
import { useOptionalGroupCall } from '@/contexts/GroupCallContext';
import { GroupCallSystemMessage } from '@/features/group-call/GroupCallSystemMessage';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import {
  FileMessageContent,
  ImageMessageContent,
  VideoMessageContent,
} from './MediaMessageContent';
import { AlbumMessageContent } from './AlbumMessageContent';
import { MessageQuickReaction } from './MessageQuickReaction';
import { MessageReactionsBar } from './MessageReactionsBar';
import { PollMessageContent } from './PollMessageContent';
import { InviteMessageContent } from './InviteMessageContent';
import { findInviteMatches } from './inviteLinkUtils';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { isPollMessage } from '@/utils/pollPayload';
import { canSaveOrForwardContent } from '@/utils/chatPermissions';
import { useChatsQuery } from '@/queries/chats.queries';
import type { MappedMessage } from '@/types/message';

function summarizeReply(content: string | null, msgType: string): string {
  if (msgType === 'voice') return 'Голосовое сообщение';
  if (msgType === 'image') return 'Фотография';
  if (msgType === 'video') return 'Видео';
  if (msgType === 'video_note') return 'Видеосообщение';
  if (msgType === 'file') return 'Файл';
  if (msgType === 'poll') return 'Опрос';
  if (content && isChatusStickerMessage(content)) return 'Стикер';
  const text = content?.trim();
  if (!text) return 'Сообщение';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function getReplyThumbnailUrl(replyMessage: MappedMessage): string | null {
  if (replyMessage.msg_type === 'image') {
    const media = replyMessage.media?.[0];
    return media?.remote_url ? resolveMediaUrl(media.remote_url) : null;
  }
  if (replyMessage.msg_type === 'video' || replyMessage.msg_type === 'video_note') {
    const media = replyMessage.media?.[0];
    return media?.thumbnail_url ? resolveMediaUrl(media.thumbnail_url) : null;
  }
  if (replyMessage.msg_type === 'text' && isChatusStickerMessage(replyMessage.content)) {
    const stickerRef = tryDecodeStickerPayload(replyMessage.content);
    return stickerRef ? getStickerImageUrl(stickerRef) : null;
  }
  return null;
}

interface MessageBubbleProps {
  chatId: string;
  chatTitle?: string;
  message: MappedMessage;
  isOutgoing: boolean;
  selectionActive: boolean;
  /** Group chats: colored sender name above the first bubble in a run. */
  showSenderName?: boolean;
  senderDisplayName?: string;
  senderNameColor?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHighlightMessage?: (messageId: string) => void;
}

export function MessageBubble({
  chatId,
  chatTitle = 'Группа',
  message,
  isOutgoing,
  selectionActive,
  showSenderName = false,
  senderDisplayName,
  senderNameColor,
  onContextMenu,
  onHighlightMessage,
}: MessageBubbleProps) {
  const groupCall = useOptionalGroupCall();

  if (message.is_deleted) {
    return null;
  }

  const { data: messages } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const chat = chats?.find((c) => c.id === chatId);
  const allowSave = canSaveOrForwardContent(chat, me);

  const groupCallPayload =
    message.msg_type === 'system' ? parseGroupCallSystemContent(message.content) : null;

  if (groupCallPayload) {
    const activeRoomId = groupCall?.activeRoomByChatId[chatId]?.id ?? null;
    const canJoin =
      groupCallPayload.action === 'started' &&
      Boolean(activeRoomId && activeRoomId === groupCallPayload.room_id) &&
      !groupCall?.isInCallForChat(chatId);
    return (
      <GroupCallSystemMessage
        payload={groupCallPayload}
        canJoin={canJoin}
        onJoin={
          canJoin && groupCall
            ? () => void groupCall.joinGroupCall(groupCallPayload.room_id, chatId, chatTitle)
            : undefined
        }
        createdAt={message.created_at}
        status={message.status}
      />
    );
  }

  if (message.msg_type === 'system') {
    return (
      <div className="message-bubble message-bubble--system">
        <p className="message-bubble__text message-bubble__text--system">
          {message.content?.trim() || 'Системное сообщение'}
        </p>
      </div>
    );
  }

  const replyMessage = message.reply_to_id
    ? messages?.find((m) => m.id === message.reply_to_id)
    : null;

  const handleReplyClick = (e: React.MouseEvent) => {
    if (selectionActive) return; // Allow click to bubble up to selection row handler
    if (!message.reply_to_id) return;
    e.preventDefault();
    e.stopPropagation();
    const element = document.getElementById(`msg-${message.reply_to_id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (onHighlightMessage) {
        onHighlightMessage(message.reply_to_id);
      }
    }
  };

  const hasReply = !!message.reply_to_id;
  const replySenderName = replyMessage?.sender_name?.trim() || 'Сообщение';
  const replyPreview = replyMessage
    ? replyMessage.is_deleted
      ? 'Удалённое сообщение'
      : summarizeReply(replyMessage.content, replyMessage.msg_type)
    : 'Предыдущее сообщение';
  const replyThumbnailUrl = replyMessage && !replyMessage.is_deleted ? getReplyThumbnailUrl(replyMessage) : null;

  const replyNode = hasReply ? (
    <div
      className={`message-reply-quote${replyMessage?.sender_id === me?.id ? ' message-reply-quote--own' : ''}`}
      onClick={handleReplyClick}
    >
      <div className="message-reply-quote__bar" />
      {replyThumbnailUrl ? (
        <img src={replyThumbnailUrl} alt="" className="message-reply-quote__thumbnail" />
      ) : null}
      <div className="message-reply-quote__body">
        <span className="message-reply-quote__label">{replySenderName}</span>
        <span className="message-reply-quote__text">{replyPreview}</span>
      </div>
    </div>
  ) : null;

  const forwardName = message.forwarded_from_name?.trim();
  const forwardNode = forwardName ? (
    <div className="message-forward-header">
      <span className="message-forward-header__label">Переслано от</span>{' '}
      <span className="message-forward-header__name">{forwardName}</span>
    </div>
  ) : null;

  const showChecks = isOutgoing && message.status !== 'error';
  const time = formatMessageTime(message.created_at);
  const stickerRef =
    message.msg_type === 'text' && isChatusStickerMessage(message.content)
      ? tryDecodeStickerPayload(message.content)
      : null;
  const stickerUrl = stickerRef ? getStickerImageUrl(stickerRef) : null;
  const mediaList = message.media ?? [];
  const media = mediaList[0];
  const mediaUrl = media?.remote_url ? resolveMediaUrl(media.remote_url) : null;
  const isAlbum = isAlbumMessage(message.msg_type, mediaList.length);
  const albumCaption = isAlbum && isAlbumCaption(message.content) ? message.content?.trim() : null;
  const videoCaption =
    !isAlbum &&
    message.msg_type === 'video' &&
    isAlbumCaption(message.content)
      ? message.content?.trim()
      : null;
  const isMediaBubble =
    isAlbum ||
    message.msg_type === 'image' ||
    message.msg_type === 'voice' ||
    message.msg_type === 'file' ||
    message.msg_type === 'video' ||
    message.msg_type === 'video_note';
  const reactions = message.reactions ?? [];
  const canReact = message.status !== 'sending' && message.status !== 'error';

  const meta = (
    <span className="message-bubble__meta">
      {message.status === 'error' ? (
        <span className="message-bubble__error-label" title="Failed to send">
          !
        </span>
      ) : null}
      <time className="message-bubble__time" dateTime={new Date(message.created_at).toISOString()}>
        {time}
      </time>
      {showChecks ? <ChatStatusChecks status={message.status} /> : null}
    </span>
  );

  const hasReactions = reactions.length > 0;

  let body: React.ReactNode;

  if (stickerUrl) {
    body = <img src={stickerUrl} alt="Sticker" className="message-bubble__sticker" />;
  } else if (isAlbum) {
    body = (
      <>
        <AlbumMessageContent
          media={mediaList}
          msgType={message.msg_type}
          allowDownload={allowSave}
        />
        {albumCaption ? (
          <p className="message-bubble__text message-bubble__caption">{albumCaption}</p>
        ) : null}
      </>
    );
  } else if (message.msg_type === 'image' && mediaUrl) {
    const imageCaption = isAlbumCaption(message.content) ? message.content?.trim() : null;
    body = (
      <>
        <ImageMessageContent url={mediaUrl} allowDownload={allowSave} />
        {imageCaption ? (
          <p className="message-bubble__text message-bubble__caption">{imageCaption}</p>
        ) : null}
      </>
    );
  } else if (message.msg_type === 'voice' && mediaUrl) {
    body = (
      <VoiceMessagePlayer
        src={mediaUrl}
        durationMs={media?.duration_ms ?? 0}
        waveformBase64={media?.waveform}
        isOutgoing={isOutgoing}
        authorLabel={message.sender_name}
      />
    );
  } else if (message.msg_type === 'file' && mediaUrl) {
    body = (
      <FileMessageContent
        url={mediaUrl}
        fileName={media?.file_name ?? null}
        fileSize={media?.file_size ?? null}
        mimeType={media?.mime_type ?? null}
        allowDownload={allowSave}
      />
    );
  } else if ((message.msg_type === 'video' || message.msg_type === 'video_note') && mediaUrl) {
    body = (
      <>
        <VideoMessageContent
          url={mediaUrl}
          poster={media?.thumbnail_url}
          round={message.msg_type === 'video_note' || Boolean(media?.is_round)}
          messageId={message.id}
          authorLabel={message.sender_name}
          durationMs={media?.duration_ms ?? 0}
          registerPlayback={message.msg_type === 'video_note' || Boolean(media?.is_round)}
          controlsDownload={allowSave}
        />
        {videoCaption ? (
          <p className="message-bubble__text message-bubble__caption">{videoCaption}</p>
        ) : null}
      </>
    );
  } else if (isPollMessage(message)) {
    body = <PollMessageContent chatId={chatId} message={message} disabled={selectionActive} />;
  } else if (message.msg_type === 'text') {
    body = isChatusStickerMessage(message.content) ? (
      <p className="message-bubble__text message-bubble__text--placeholder">Sticker</p>
    ) : message.content && findInviteMatches(message.content).length > 0 ? (
      <InviteMessageContent content={message.content} selectionActive={selectionActive} />
    ) : (
      <p className="message-bubble__text">{message.content}</p>
    );
  } else {
    body = (
      <p className="message-bubble__text message-bubble__text--placeholder">
        {message.content ?? `[${message.msg_type}]`}
      </p>
    );
  }

  const resolvedSenderName =
    senderDisplayName?.trim() || message.sender_name?.trim() || '';
  const senderNameNode =
    showSenderName && resolvedSenderName ? (
      <span
        className="message-bubble__sender-name"
        style={senderNameColor ? { color: senderNameColor } : undefined}
      >
        {resolvedSenderName}
      </span>
    ) : null;

  return (
    <div
      className={`message-stack${isOutgoing ? ' message-stack--outgoing' : ' message-stack--incoming'}`}
    >
      <div
        className={`message-bubble${isOutgoing ? ' message-bubble--outgoing' : ' message-bubble--incoming'}${message.status === 'sending' ? ' message-bubble--sending' : ''}${message.status === 'error' ? ' message-bubble--error' : ''}${stickerUrl ? ' message-bubble--sticker' : ''}${isMediaBubble ? ' message-bubble--media' : ''}${message.msg_type === 'video_note' || Boolean(media?.is_round) ? ' message-bubble--video-note' : ''}${isAlbum ? ' message-bubble--album' : ''}${hasReactions ? ' message-bubble--with-reactions' : ''}${replyMessage ? ' message-bubble--with-reply' : ''}${senderNameNode ? ' message-bubble--with-sender' : ''}`}
        onContextMenu={onContextMenu}
      >
        {canReact ? (
          <MessageQuickReaction chatId={chatId} messageId={message.id} />
        ) : null}
        <div className="message-bubble__content">
          {hasReactions ? (
            <>
              {senderNameNode}
              {forwardNode}
              {replyNode}
              <div className="message-bubble__body">{body}</div>
              <div className="message-bubble__footer">
                <MessageReactionsBar
                  chatId={chatId}
                  messageId={message.id}
                  reactions={reactions}
                  isOutgoing={isOutgoing}
                  disabled={!canReact}
                />
                {meta}
              </div>
            </>
          ) : (
            <>
              {senderNameNode}
              {forwardNode}
              {replyNode}
              {body}
              {meta}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

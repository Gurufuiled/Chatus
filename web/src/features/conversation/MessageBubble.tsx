import { ChatStatusChecks } from '@/features/chat-list/ChatStatusChecks';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import { resolveMediaUrl } from '@/services/mediaService';
import { formatMessageTime } from './messageFormatters';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import { isAlbumCaption, isAlbumMessage } from '@/utils/albumCaption';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import {
  FileMessageContent,
  ImageMessageContent,
  VideoMessageContent,
} from './MediaMessageContent';
import { AlbumMessageContent } from './AlbumMessageContent';
import { MessageQuickReaction } from './MessageQuickReaction';
import { MessageReactionsBar } from './MessageReactionsBar';
import type { MappedMessage } from '@/types/message';

interface MessageBubbleProps {
  chatId: string;
  message: MappedMessage;
  isOutgoing: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function MessageBubble({
  chatId,
  message,
  isOutgoing,
  onContextMenu,
}: MessageBubbleProps) {
  if (message.is_deleted) {
    return (
      <div
        className={`message-bubble message-bubble--deleted${isOutgoing ? ' message-bubble--outgoing' : ' message-bubble--incoming'}`}
      >
        <span className="message-bubble__deleted-text">Deleted message</span>
      </div>
    );
  }

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
    (message.msg_type === 'video' || message.msg_type === 'video_note') &&
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
      {canReact ? (
        <MessageQuickReaction chatId={chatId} messageId={message.id} />
      ) : null}
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

  let body: React.ReactNode;

  if (stickerUrl) {
    body = <img src={stickerUrl} alt="Sticker" className="message-bubble__sticker" />;
  } else if (isAlbum) {
    body = (
      <>
        <AlbumMessageContent media={mediaList} msgType={message.msg_type} />
        {albumCaption ? (
          <p className="message-bubble__text message-bubble__caption">{albumCaption}</p>
        ) : null}
      </>
    );
  } else if (message.msg_type === 'image' && mediaUrl) {
    body = <ImageMessageContent url={mediaUrl} />;
  } else if (message.msg_type === 'voice' && mediaUrl) {
    body = (
      <VoiceMessagePlayer
        src={mediaUrl}
        durationMs={media?.duration_ms ?? 1000}
        waveformBase64={media?.waveform}
        isOutgoing={isOutgoing}
      />
    );
  } else if (message.msg_type === 'file' && mediaUrl) {
    body = (
      <FileMessageContent
        url={mediaUrl}
        fileName={media?.file_name ?? null}
        fileSize={media?.file_size ?? null}
        mimeType={media?.mime_type ?? null}
      />
    );
  } else if ((message.msg_type === 'video' || message.msg_type === 'video_note') && mediaUrl) {
    body = (
      <>
        <VideoMessageContent
          url={mediaUrl}
          poster={media?.thumbnail_url}
          round={message.msg_type === 'video_note' || Boolean(media?.is_round)}
        />
        {videoCaption ? (
          <p className="message-bubble__text message-bubble__caption">{videoCaption}</p>
        ) : null}
      </>
    );
  } else if (message.msg_type === 'text') {
    body = isChatusStickerMessage(message.content) ? (
      <p className="message-bubble__text message-bubble__text--placeholder">Sticker</p>
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

  return (
    <div
      className={`message-stack${isOutgoing ? ' message-stack--outgoing' : ' message-stack--incoming'}`}
    >
      <div
        className={`message-bubble${isOutgoing ? ' message-bubble--outgoing' : ' message-bubble--incoming'}${message.status === 'sending' ? ' message-bubble--sending' : ''}${message.status === 'error' ? ' message-bubble--error' : ''}${stickerUrl ? ' message-bubble--sticker' : ''}${isMediaBubble ? ' message-bubble--media' : ''}${isAlbum ? ' message-bubble--album' : ''}`}
        onContextMenu={onContextMenu}
      >
        <div className="message-bubble__content">
          {body}
          {meta}
        </div>
      </div>
      {reactions.length > 0 ? (
        <MessageReactionsBar
          chatId={chatId}
          messageId={message.id}
          reactions={reactions}
          isOutgoing={isOutgoing}
          disabled={!canReact}
        />
      ) : null}
    </div>
  );
}
